import { useEffect, useRef } from "react";

import { WATCH_INTERVAL } from "@/config/player/playbackTiming.config";
import { scheduleCardPrefetch, scheduleNeighborPrefetch } from "@/lib/core/cardCache.utils";
import { createInterval } from "@/lib/core/interval.utils";
import { ignore } from "@/lib/core/promise.utils";
import { readPlaylistEntries, saveWatch } from "@/lib/player/playback.utils";
import { getMediaEntry, setMediaPosition } from "@/store/media.store";
import { playbackAtoms, streamSession } from "@/store/player.store";

export function usePlayerWatchProgress({ playlistOpen }: { playlistOpen: boolean }): void {
  const lastSavedWatchRef = useRef<{ path: string; position: number } | null>(null);

  useEffect(() => {
    const { cancel } = createInterval(() => {
      const path = playbackAtoms.path.get();
      const eofReached = playbackAtoms.eofReached.get();
      const duration = playbackAtoms.duration.get();
      if (!path || eofReached || duration <= 0) {
        return;
      }
      const timePos = playbackAtoms.timePos.get();
      const session = streamSession.get();
      const watchPath = session ? session.watchKey : path;
      const lastSaved = lastSavedWatchRef.current;
      if (lastSaved && lastSaved.path === watchPath && lastSaved.position === timePos) {
        return;
      }
      lastSavedWatchRef.current = { path: watchPath, position: timePos };
      const entry = session ? undefined : getMediaEntry(path);
      if (!session) setMediaPosition(path, timePos, duration);
      ignore(
        saveWatch(watchPath, {
          position: timePos,
          duration,
          subDelay: entry?.subOffset ?? 0,
          audioDelay: entry?.audioOffset ?? 0,
          updatedAt: Math.floor(Date.now() / 1000),
        })
      );
    }, WATCH_INTERVAL);
    return cancel;
  }, []);

  useEffect(() => {
    const path = playbackAtoms.path.get();
    const playlistCount = playbackAtoms.playlistCount.get();
    const playlistIndex = playbackAtoms.playlistIndex.get();
    if (!path || playlistCount === 0) return;
    let cancelled = false;
    ignore(
      readPlaylistEntries().then((entries) => {
        if (cancelled) return;
        const filenames = entries.map((entry) => entry.filename);
        if (playlistOpen) scheduleCardPrefetch(filenames, path);
        else scheduleNeighborPrefetch(filenames, path, playlistIndex);
        return null;
      })
    );
    return () => {
      cancelled = true;
    };
  }, [playlistOpen]);
}
