import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { useFolderContentChanged } from "@/hooks/watcher/changes.watcher.hook";
import { createInterval } from "@/lib/pacer/interval.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import {
  desiredFolderPlaylist,
  planLiveInserts,
  planLiveRemovals,
} from "@/lib/player/livePlaylist.utils";
import {
  buildTorrentPlayerPlaylist,
  insertPlaylistFiles,
  playPlaylistIndex,
  readPath,
  readPlaylistEntries,
  removePlaylistIndex,
  seekTo,
} from "@/lib/player/playback.utils";
import { folderScanBus } from "@/lib/player/scanBus.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { touchesExtensions } from "@/lib/watcher/changes.watcher";
import { isSameOrInside, samePath } from "@/lib/watcher/paths.watcher";
import { playbackAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { PlaylistWatch } from "@/types/videoPlayer";

const LIVE_TORRENT_POLL_MS = 10_000;
const LIVE_TORRENT_FAIL_LIMIT = 3;

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

async function removePlaylistIndexes(indices: number[]): Promise<void> {
  for (const index of indices) await removePlaylistIndex(index);
}

/**
 * Drops entries that left the desired list. Only previously planned paths are
 * touched, so hand-added files never disappear. The playlist is re-read after
 * the removals so later insert indices match the shrunken list. Returns null
 * when the playlist could not be updated, and the caller retries.
 */
async function applyRemovals(
  desired: string[],
  previous: string[] | null,
  livePaths: string[]
): Promise<{ base: string[]; removed: string[] } | null> {
  const removalIndices = planLiveRemovals(previous ?? [], desired, livePaths);
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

/**
 * Puts playback back on the file it was on before the playlist changed. A file
 * that was just removed is left alone: mpv already moved on (or idled).
 */
async function restoreCurrent(current: string, removed: string[]): Promise<void> {
  if (removed.some((path) => path !== "" && samePath(path, current))) return;
  const [fresh, freshError] = await attempt(readPlaylistEntries());
  if (freshError || !fresh) {
    reportBackgroundError("livePlaylist.verify", freshError ?? new Error("empty playlist entries"));
    return;
  }
  const target = fresh.findIndex((entry) => samePath(entry.filename, current));
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
  previous: string[] | null
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
    live.map((entry) => entry.filename)
  );
  if (!outcome) return "retry";
  const { base, removed } = outcome;

  const ops = planLiveInserts(desired, base, anchor);
  if (ops.length === 0) {
    return base.some((path) => samePath(path, anchor)) ? "ok" : "stale";
  }
  const [, insertError] = await attempt(insertPlaylistFiles(ops));
  if (insertError) {
    reportBackgroundError("livePlaylist.insert", insertError);
    return "retry";
  }
  const after = await readPath();
  if (after !== current && current !== "") await restoreCurrent(current, removed);
  return "ok";
}

export interface LivePlaylistOptions {
  /** Called when the currently playing file was rewritten on disk. */
  onPlayingFileModified?: () => void;
}

export function useLivePlaylistSync(
  watch: PlaylistWatch | null | undefined,
  options?: LivePlaylistOptions
): void {
  const onPlayingFileModified = options?.onPlayingFileModified;
  const queryClient = useQueryClient();
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const scanThreads = useCell(settingsAtoms.scanThreads);
  const [armed, setArmed] = useState(true);
  const busyRef = useRef(false);
  const desiredRef = useRef<string[] | null>(null);
  const failsRef = useRef(0);
  // A downloading torrent rewrites its files constantly, so a `modified`
  // event alone must never reload the playing file. Only a stable (fully
  // downloaded) torrent gets the same modified-reload as a plain folder.
  const stableRef = useRef(false);

  useEffect(() => {
    desiredRef.current = null;
    failsRef.current = 0;
    setArmed(true);
  }, [watch]);

  const trackExts = useMemo(
    () => new Set([...audioExtensions, ...subtitleExtensions]),
    [audioExtensions, subtitleExtensions]
  );

  const syncDesired = useCallback(
    async (desired: string[] | null): Promise<void> => {
      if (!watch || desired === null) {
        setArmed(false);
        return;
      }
      if (desiredRef.current && sameList(desiredRef.current, desired)) return;
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const outcome = await reconcile(desired, watch.anchor, desiredRef.current);
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
    const [files, error] = await attempt(torrentApi.runningTorrentFiles(watch.torrentId));
    if (error || !files) {
      failsRef.current += 1;
      if (failsRef.current >= LIVE_TORRENT_FAIL_LIMIT) setArmed(false);
      else reportBackgroundError("livePlaylist.poll", error ?? new Error("empty torrent files"));
      return;
    }
    failsRef.current = 0;
    stableRef.current = files.every((file) => file.completed);
    // Same extras the torrent sections show next to the files: an upscale
    // written into the save dir joins the live playlist like a folder file.
    const extras =
      queryClient.getQueryData<ReadonlyArray<{ fullPath: string }>>(
        queryKeys.extraFiles(watch.saveDir)
      ) ?? [];
    const playlist = buildTorrentPlayerPlaylist(
      files,
      watch.saveDir,
      watch.anchor,
      trackExts,
      extras.map((entry) => entry.fullPath)
    );
    await syncDesired(playlist ? playlist.files : null);
  }, [watch, trackExts, syncDesired, queryClient]);

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
      // The desired list is built from a video-only scan; other files cannot
      // change it, so skip the scan entirely.
      if (!touchesExtensions(payload.changes, videoExtensions)) return;
      const playing = playbackAtoms.path.get();
      const playingModified =
        !!playing &&
        payload.changes.some(
          (change) => change.kind === "modified" && samePath(change.path, playing)
        );
      ignore(
        (async () => {
          // Shared tick: the player route asks for the same root on the same
          // event, so both go through one `refresh_file_index` call instead of
          // a walk each.
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
          await syncDesired(desiredFolderPlaylist(entries, watch.root, watch.anchor));
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
      // Same skip as the folder branch: the torrent playlist is built from
      // video files, so batches without one cannot change it.
      if (!touchesExtensions(payload.changes, videoExtensions)) return;
      const playing = playbackAtoms.path.get();
      const playingModified =
        !!playing &&
        stableRef.current &&
        payload.changes.some(
          (change) => change.kind === "modified" && samePath(change.path, playing)
        );
      ignore(
        (async () => {
          // Refresh this torrent's extras first: the route invalidates them
          // on the same event, but the refetch may not have landed yet.
          await queryClient.refetchQueries({ queryKey: queryKeys.extraFiles(watch.saveDir) });
          await checkTorrent();
          if (playingModified) onPlayingFileModified?.();
        })()
      );
    },
    { enabled: !!watch && armed && watch.kind === "torrent", errorTag: "livePlaylist" }
  );
}
