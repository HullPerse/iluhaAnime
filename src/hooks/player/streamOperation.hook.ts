import { useCallback, useEffect, useRef } from "react";

import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { openStream } from "@/lib/player/playback.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";
import {
  beginStreamRequest,
  playbackAtoms,
  streamRequest,
  streamSession,
} from "@/store/player.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

/** Only the latest selection owned by a mounted player may replace its session. */
export function useStreamOperation() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(async (build: (current: StreamOpen) => Promise<StreamOpen | null>) => {
    const base = streamSession.get();
    if (!base) return false;
    const request = beginStreamRequest();
    const current = () => mounted.current && streamRequest.get() === request;
    const [next, failure] = await attempt(build(base));
    if (!current() || streamSession.get() !== base) return false;
    if (failure || !next) {
      if (failure) reportBackgroundError("player.stream.resolve", failure);
      addNotification(
        tr("stream.playFailed"),
        "error",
        failure?.message ?? tr("stream.noNextEpisode")
      );
      return false;
    }
    playbackAtoms.streamResume.set(next.resume ?? 0);
    const [, openFailure] = await attempt(openStream(next));
    if (!current()) return false;
    const latest = streamSession.get();
    if (
      latest !== base &&
      (latest?.watchKey !== next.watchKey || latest.mediaUrl !== next.mediaUrl)
    )
      return false;
    if (openFailure) {
      playbackAtoms.streamResume.set(null);
      reportBackgroundError("player.stream.open", openFailure);
      addNotification(tr("stream.playFailed"), "error", openFailure.message);
      return false;
    }
    streamSession.set(next);
    return true;
  }, []);
}
