import { useEffect, useRef } from "react";
import { scheduleTask } from "@hullperse/hp_utils/shared";

import { useCell } from "@hullperse/hp_utils/react";
import { shouldReleaseStreamPin } from "@/lib/player/playerChrome.utils";
import { playbackAtoms } from "@/store/player.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

const STREAM_HOLD_TIMEOUT = 15_000;

export function useStreamPin(stream: StreamOpen | null, loadingFile: boolean): void {
  const streamResume = useCell(playbackAtoms.streamResume);
  const playbackTime = useCell(playbackAtoms.timePos);

  const streamUrlRef = useRef<string | null>(null);
  const pinnedStreamUrlRef = useRef<string | null>(null);

  useEffect(() => {
    streamUrlRef.current = stream?.mediaUrl ?? null;
  }, [stream]);

  useEffect(() => {
    if (streamResume === null) {
      pinnedStreamUrlRef.current = null;

      return;
    }

    pinnedStreamUrlRef.current = streamUrlRef.current;
  }, [streamResume]);

  useEffect(() => {
    if (
      shouldReleaseStreamPin({
        streamResume,
        loadingFile,
        playbackTime,
        pinnedUrl: pinnedStreamUrlRef.current,
        currentUrl: streamUrlRef.current,
      })
    ) {
      playbackAtoms.streamResume.set(null);
    }
  }, [loadingFile, playbackTime, streamResume]);

  useEffect(() => {
    if (streamResume === null) return;
    const task = scheduleTask("timeout", STREAM_HOLD_TIMEOUT, () =>
      playbackAtoms.streamResume.set(null)
    );

    return () => task.cancel();
  }, [streamResume]);
}
