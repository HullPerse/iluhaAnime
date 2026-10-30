import { useCallback, useEffect, useRef } from "react";

import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { computeVideoMargins, marginsCloseEnough, ZERO_MARGINS } from "@/lib/core/margins.utils";
import { ignore } from "@/lib/core/promise.utils";
import { scheduleTask } from "@/lib/core/shared.utils";
import { setVideoMarginRatio } from "@/lib/player/playback.utils";
import { playbackAtoms } from "@/store/player.store";
import type { VideoMargins } from "@/types/core/margins";
import type { ScheduledTask } from "@/types/core/shared";

export function usePlayerMargins(immersive: boolean) {
  const videoRef = useRef<HTMLDivElement>(null);
  const marginsTaskRef = useRef<ScheduledTask | null>(null);
  const lastMarginsRef = useRef<VideoMargins | null>(null);

  const readMargins = useCallback((): VideoMargins => {
    const rect = videoRef.current?.getBoundingClientRect();
    return computeVideoMargins(window.innerWidth || 1, window.innerHeight || 1, rect ?? undefined);
  }, []);

  const measureMargins = useCallback(
    (): VideoMargins => (immersive ? { ...ZERO_MARGINS } : readMargins()),
    [immersive, readMargins]
  );

  const sendMargins = useCallback((next: VideoMargins, force: boolean) => {
    if (!force && lastMarginsRef.current && marginsCloseEnough(lastMarginsRef.current, next)) {
      return;
    }
    if (!playbackAtoms.ready.get()) {
      lastMarginsRef.current = null;
      return;
    }
    ignore(
      setVideoMarginRatio(next)
        .then(() => {
          lastMarginsRef.current = next;
          return null;
        })
        .catch((error: unknown) => {
          lastMarginsRef.current = null;
          reportBackgroundError("player.margins", error);
        })
    );
  }, []);

  const syncMargins = useCallback(
    (force = false) => {
      marginsTaskRef.current?.cancel();
      marginsTaskRef.current = scheduleTask("raf", 0, () => {
        sendMargins(measureMargins(), force);
      });
    },
    [measureMargins, sendMargins]
  );

  const syncMarginsRef = useRef(syncMargins);
  useEffect(() => {
    syncMarginsRef.current = syncMargins;
  }, [syncMargins]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncMargins());
    observer.observe(element);
    return () => observer.disconnect();
  }, [syncMargins]);

  useEffect(() => {
    const onResize = () => syncMargins();
    window.addEventListener("resize", onResize);
    syncMargins();
    return () => window.removeEventListener("resize", onResize);
  }, [syncMargins]);

  useEffect(() => {
    return () => marginsTaskRef.current?.cancel();
  }, []);

  return { videoRef, syncMargins, syncMarginsRef };
}
