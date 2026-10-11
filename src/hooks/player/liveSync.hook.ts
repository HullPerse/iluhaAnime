import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { desiredFolderPlaylist, planLiveInserts } from "@/lib/player/livePlaylist.utils";
import {
  buildTorrentPlayerPlaylist,
  insertPlaylistFiles,
  playPlaylistIndex,
  readPath,
  readPlaylistEntries,
  seekTo,
} from "@/lib/player/playback.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { playbackAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { VideoFileEntry } from "@/types/fs";
import type { PlaylistWatch } from "@/types/videoPlayer";

const LIVE_TORRENT_POLL_MS = 10_000;
const LIVE_TORRENT_FAIL_LIMIT = 3;

function samePath(a: string, b: string): boolean {
  return a.replaceAll("\\", "/").toLowerCase() === b.replaceAll("\\", "/").toLowerCase();
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

async function reconcile(desired: string[], anchor: string): Promise<"ok" | "stale" | "retry"> {
  const [live, liveError] = await attempt(readPlaylistEntries());
  if (liveError || !live) {
    reportBackgroundError("livePlaylist.read", liveError ?? new Error("empty playlist entries"));
    return "retry";
  }
  const current = await readPath();
  const ops = planLiveInserts(
    desired,
    live.map((entry) => entry.filename),
    anchor
  );
  if (ops.length === 0) {
    return live.some((entry) => samePath(entry.filename, anchor)) ? "ok" : "stale";
  }
  const [, insertError] = await attempt(insertPlaylistFiles(ops));
  if (insertError) {
    reportBackgroundError("livePlaylist.insert", insertError);
    return "retry";
  }
  const after = await readPath();
  if (after === current || current === "") return "ok";
  const timePos = playbackAtoms.timePos.get();
  const [fresh, freshError] = await attempt(readPlaylistEntries());
  if (freshError || !fresh) {
    reportBackgroundError("livePlaylist.verify", freshError ?? new Error("empty playlist entries"));
    return "ok";
  }
  const target = fresh.findIndex((entry) => samePath(entry.filename, current));
  if (target === -1) {
    reportBackgroundError("livePlaylist.verify", new Error("current file left the playlist"));
    return "ok";
  }
  const [, playError] = await attempt(playPlaylistIndex(target));
  if (playError) {
    reportBackgroundError("livePlaylist.restore", playError);
    return "ok";
  }
  if (timePos > 0) {
    const [, seekError] = await attempt(seekTo(timePos));
    if (seekError) reportBackgroundError("livePlaylist.restore", seekError);
  }
  return "ok";
}

export function useLivePlaylistSync(watch: PlaylistWatch | null | undefined): void {
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const [armed, setArmed] = useState(true);
  const busyRef = useRef(false);
  const desiredRef = useRef<string[] | null>(null);
  const failsRef = useRef(0);

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
        const outcome = await reconcile(desired, watch.anchor);
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
    const playlist = buildTorrentPlayerPlaylist(files, watch.saveDir, watch.anchor, trackExts);
    await syncDesired(playlist ? playlist.files : null);
  }, [watch, trackExts, syncDesired]);

  const isTorrentWatch = !!watch && watch.kind === "torrent";

  useEffect(() => {
    if (!isTorrentWatch || !armed) return;
    ignore(checkTorrent());
    const timer = window.setInterval(() => {
      ignore(checkTorrent());
    }, LIVE_TORRENT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isTorrentWatch, armed, checkTorrent]);

  useTauriEvent<string[]>(
    "folder-content-changed",
    (event) => {
      if (!watch || !armed || watch.kind !== "folder") return;
      const root = watch.root.replaceAll("\\", "/").toLowerCase();
      const hit = (event.payload ?? []).some((changed) => {
        const dir = changed.replaceAll("\\", "/").toLowerCase();
        return root === dir || root.startsWith(`${dir}/`);
      });
      if (!hit) return;
      ignore(
        (async () => {
          const [entries, error] = await attempt(
            invokeTyped<VideoFileEntry[]>("scan_video_folder", {
              path: watch.root,
              extensions: videoExtensions,
            })
          );
          if (error || !entries) {
            reportBackgroundError("livePlaylist.scan", error ?? new Error("empty folder scan"));
            return;
          }
          await syncDesired(desiredFolderPlaylist(entries, watch.root, watch.anchor));
        })()
      );
    },
    { enabled: !!watch && armed && watch.kind === "folder", errorTag: "livePlaylist" }
  );
}
