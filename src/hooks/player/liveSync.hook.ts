import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useFolderContentChanged } from "@/hooks/watcher/changes.watcher.hook";
import { createInterval } from "@/lib/pacer/interval.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import {
  desiredFolderPlaylist,
  planLiveInserts,
  planLiveRemovals,
} from "@/lib/player/livePlaylist.utils";
import {
  insertPlaylistFiles,
  playPlaylistIndex,
  readPath,
  readPlaylistEntries,
  removePlaylistIndex,
  seekTo,
} from "@/lib/player/playback.utils";
import { folderScanBus } from "@/lib/player/scanBus.utils";
import {
  isStreamTarget,
  mediaKeyForTarget,
  targetForMediaKey,
  torrentPlaybackTargets,
} from "@/lib/player/stream.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { touchesExtensions } from "@/lib/watcher/changes.watcher";
import { isSameOrInside, samePath } from "@/lib/watcher/paths.watcher";
import { playbackAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { PlayerSource, PlaylistWatch } from "@/types/videoPlayer";

const LIVE_TORRENT_POLL_MS = 10_000;

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

async function removePlaylistIndexes(indices: number[]): Promise<void> {
  for (const index of indices) await removePlaylistIndex(index);
}

async function applyRemovals(
  desired: string[],
  previous: string[] | null,
  livePaths: string[],
  mediaKey: (target: string) => string
): Promise<{ base: string[]; removed: string[] } | null> {
  const removalIndices = planLiveRemovals(
    (previous ?? []).map(mediaKey),
    desired.map(mediaKey),
    livePaths.map(mediaKey)
  );
  if (removalIndices.length === 0) return { base: livePaths, removed: [] };
  const removed = removalIndices.map((index) => livePaths[index] ?? "");
  const [, removeError] = await attempt(removePlaylistIndexes(removalIndices));
  if (removeError) {
    reportBackgroundError("livePlaylist.remove", removeError);
    return null;
  }
  const [reread, rereadError] = await attempt(readPlaylistEntries());
  if (rereadError || !reread) {
    reportBackgroundError("livePlaylist.read", rereadError ?? new Error("empty playlist entries"));
    return null;
  }
  return { base: reread.map((entry) => entry.filename), removed };
}

async function restoreCurrent(
  current: string,
  removed: string[],
  mediaKey: (target: string) => string
): Promise<void> {
  const currentKey = mediaKey(current);
  if (removed.some((path) => path !== "" && samePath(mediaKey(path), currentKey))) return;
  const [fresh, freshError] = await attempt(readPlaylistEntries());
  if (freshError || !fresh) {
    reportBackgroundError("livePlaylist.verify", freshError ?? new Error("empty playlist entries"));
    return;
  }
  const target = fresh.findIndex((entry) => samePath(mediaKey(entry.filename), currentKey));
  if (target === -1) {
    reportBackgroundError("livePlaylist.verify", new Error("current file left the playlist"));
    return;
  }
  const [, playError] = await attempt(playPlaylistIndex(target));
  if (playError) {
    reportBackgroundError("livePlaylist.restore", playError);
    return;
  }
  const timePos = playbackAtoms.timePos.get();
  if (timePos > 0) {
    const [, seekError] = await attempt(seekTo(timePos));
    if (seekError) reportBackgroundError("livePlaylist.restore", seekError);
  }
}

async function reconcile(
  desired: string[],
  anchor: string,
  previous: string[] | null,
  mediaKey: (target: string) => string
): Promise<"ok" | "stale" | "retry"> {
  const [[live, liveError], current] = await Promise.all([
    attempt(readPlaylistEntries()),
    readPath(),
  ]);
  if (liveError || !live) {
    reportBackgroundError("livePlaylist.read", liveError ?? new Error("empty playlist entries"));
    return "retry";
  }

  const outcome = await applyRemovals(
    desired,
    previous,
    live.map((entry) => entry.filename),
    mediaKey
  );
  if (!outcome) return "retry";
  const { base, removed } = outcome;

  const anchorKey = mediaKey(anchor);
  const ops = planLiveInserts(
    desired.map(mediaKey),
    base.map(mediaKey),
    anchorKey
  ).map((op) => ({ path: desired[op.index], index: op.index }));
  if (ops.length === 0) {
    return base.some((path) => samePath(mediaKey(path), anchorKey)) ? "ok" : "stale";
  }
  const [, insertError] = await attempt(insertPlaylistFiles(ops));
  if (insertError) {
    reportBackgroundError("livePlaylist.insert", insertError);
    return "retry";
  }
  const after = await readPath();
  if (after !== current && current !== "") await restoreCurrent(current, removed, mediaKey);
  return "ok";
}

async function reconcileWatch(
  desired: string[],
  previous: string[] | null,
  watch: PlaylistWatch,
  sources: readonly PlayerSource[]
): Promise<"ok" | "stale" | "retry"> {
  return reconcile(
    desired,
    targetForMediaKey(sources, watch.anchor),
    previous,
    (target) => mediaKeyForTarget(sources, target)
  );
}

export interface LivePlaylistOptions {
  onPlayingFileModified?: () => void;
}

export function useLivePlaylistSync(
  watch: PlaylistWatch | null | undefined,
  sources: readonly PlayerSource[],
  options?: LivePlaylistOptions
): void {
  const onPlayingFileModified = options?.onPlayingFileModified;
  const queryClient = useQueryClient();
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const scanThreads = useCell(settingsAtoms.scanThreads);
  const [armed, setArmed] = useState(true);
  const busyRef = useRef(false);
  const desiredRef = useRef<string[] | null>(null);

  useEffect(() => {
    desiredRef.current = null;
    setArmed(true);
  }, [watch, sources]);

  const syncDesired = useCallback(
    async (
      desired: string[] | null,
      currentSources: readonly PlayerSource[]
    ): Promise<void> => {
      if (!watch || desired === null) {
        setArmed(false);
        return;
      }
      if (desiredRef.current && sameList(desiredRef.current, desired)) return;
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const outcome = await reconcileWatch(
          desired,
          desiredRef.current,
          watch,
          currentSources
        );
        if (outcome === "retry") return;
        desiredRef.current = desired;
        if (outcome === "stale") setArmed(false);
      } finally {
        busyRef.current = false;
      }
    },
    [watch]
  );

  const checkTorrent = useCallback(async (): Promise<void> => {
    if (!watch || watch.kind !== "torrent") return;
    const extras =
      queryClient.getQueryData<ReadonlyArray<{ fullPath: string }>>(
        queryKeys.extraFiles(watch.saveDir)
      ) ?? [];
    // Sources were prepared when the player opened, so every item already has a
    // target (URL or path). Extras are the only thing that can be added later.
    await syncDesired(
      torrentPlaybackTargets(
        sources,
        extras.map((entry) => entry.fullPath)
      ),
      sources
    );
  }, [watch, sources, syncDesired, queryClient]);

  const isTorrentWatch = !!watch && watch.kind === "torrent";

  useEffect(() => {
    if (!isTorrentWatch || !armed) return;
    ignore(checkTorrent());
    const { cancel } = createInterval(() => {
      ignore(checkTorrent());
    }, LIVE_TORRENT_POLL_MS);
    return cancel;
  }, [isTorrentWatch, armed, checkTorrent]);

  useFolderContentChanged(
    (payload) => {
      if (!watch || !armed || watch.kind !== "folder") return;
      const hit = payload.roots.some((dir) => isSameOrInside(dir, watch.root));
      if (!hit) return;
      if (!touchesExtensions(payload.changes, videoExtensions)) return;
      const playing = playbackAtoms.path.get();
      const playingModified =
        !!playing &&
        payload.changes.some(
          (change) => change.kind === "modified" && samePath(change.path, playing)
        );
      ignore(
        (async () => {
          const [entries, error] = await attempt(
            folderScanBus().fullScan({
              root: watch.root,
              extensions: videoExtensions,
              threads: scanThreads,
            })
          );
          if (error || !entries) {
            reportBackgroundError("livePlaylist.scan", error ?? new Error("empty folder scan"));
            return;
          }
          await syncDesired(
            desiredFolderPlaylist(entries, watch.root, watch.anchor),
            []
          );
          if (playingModified) onPlayingFileModified?.();
        })()
      );
    },
    { enabled: !!watch && armed && watch.kind === "folder", errorTag: "livePlaylist" }
  );

  useFolderContentChanged(
    (payload) => {
      if (!watch || !armed || watch.kind !== "torrent") return;
      const hit = payload.changes.some((change) => isSameOrInside(watch.saveDir, change.path));
      if (!hit) return;
      if (!touchesExtensions(payload.changes, videoExtensions)) return;
      const playing = playbackAtoms.path.get();
      const playingModified =
        !!playing &&
        !isStreamTarget(playing) &&
        payload.changes.some((change) => {
          if (change.kind !== "modified") return false;
          return samePath(change.path, mediaKeyForTarget(sources, playing));
        });
      ignore(
        (async () => {
          await queryClient.refetchQueries({ queryKey: queryKeys.extraFiles(watch.saveDir) });
          await checkTorrent();
          if (playingModified) onPlayingFileModified?.();
        })()
      );
    },
    { enabled: !!watch && armed && watch.kind === "torrent", errorTag: "livePlaylist" }
  );
}
