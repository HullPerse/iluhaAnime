import { useCallback } from "react";

import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/shared/promise.utils";
import { stepSpeed } from "@/lib/core/player/speed.utils";
import { translate } from "@/lib/locale/i18n.utils";
import {
  closePlayerWindow,
  nextFile,
  playPlaylistIndex,
  previousFile,
  seekTo,
  setMpvProperty,
  setPaused,
  setSpeed,
  startFrameStep,
} from "@/lib/player/playback.utils";
import { addNotification } from "@/store/notification.store";
import {
  playbackAtoms,
  setHwdec,
  setPlaybackMuted,
  setPlaybackPaused,
  setPlaybackSpeed,
  setSeekTarget,
  setVolume,
} from "@/store/player.store";
import type { PlayerTransport, PlayerTransportOptions } from "@/types/player/transport";

export function usePlayerTransport(options: PlayerTransportOptions): PlayerTransport {
  const { setFinished, setLoadingFile, streamNext, streaming, onCycleTrack, hwdecReloadRef } =
    options;

  const onPlay = useCallback(() => {
    if (!playbackAtoms.hasFile.get()) return;
    if (playbackAtoms.eofReached.get()) {
      setFinished(false);
      setSeekTarget(0);
      setPlaybackPaused(false);
      seekTo(0, "exact")
        .then(() => setPaused(false))
        .catch(() => {
          setPlaybackPaused(true);
        });
      return;
    }
    setPlaybackPaused(false);
    setPaused(false).catch(() => setPlaybackPaused(true));
  }, [setFinished]);

  const onPause = useCallback(() => {
    setPlaybackPaused(true);
    setPaused(true).catch(() => setPlaybackPaused(false));
  }, []);

  const onPlayPause = useCallback(() => {
    if (playbackAtoms.paused.get()) {
      onPlay();
      return;
    }
    onPause();
  }, [onPause, onPlay]);

  const onFileNext = useCallback(() => {
    setFinished(false);
    setLoadingFile(true);
    if (streaming) {
      ignore(streamNext.goNext());
      return;
    }
    ignore(nextFile());
  }, [setFinished, setLoadingFile, streamNext, streaming]);

  const onFilePrev = useCallback(() => {
    setFinished(false);
    setLoadingFile(true);
    ignore(previousFile());
  }, [setFinished, setLoadingFile]);

  const onPlayIndex = useCallback(
    async (index: number) => {
      setLoadingFile(true);
      await playPlaylistIndex(index);
    },
    [setLoadingFile]
  );

  const onVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolume(clamped);
    if (playbackAtoms.muted.get()) {
      setPlaybackMuted(false);
      setMpvProperty("mute", false).catch(() => setPlaybackMuted(true));
    }
  }, []);

  const onMute = useCallback(() => {
    const next = !playbackAtoms.muted.get();
    setPlaybackMuted(next);
    setMpvProperty("mute", next).catch(() => setPlaybackMuted(!next));
  }, []);

  const onSpeed = useCallback((value: number) => {
    const previous = playbackAtoms.speed.get();
    setPlaybackSpeed(value);
    setSpeed(value).catch(() => setPlaybackSpeed(previous));
  }, []);

  const handleHwdec = useCallback(
    (mode: Parameters<PlayerTransport["handleHwdec"]>[0]) => {
      const playlistIndex = playbackAtoms.playlistIndex.get();
      const timePos = playbackAtoms.timePos.get();
      const paused = playbackAtoms.paused.get();
      setHwdec(mode);
      if (!playbackAtoms.hasFile.get() || playlistIndex < 0) return;
      hwdecReloadRef.current = { position: timePos, paused };
      setLoadingFile(true);
      setMpvProperty("hwdec", mode)
        .then(() => playPlaylistIndex(playlistIndex))
        .catch((error: unknown) => {
          hwdecReloadRef.current = null;
          setLoadingFile(false);
          reportBackgroundError("player.hwdec.reload", error);
          addNotification(
            translate("player.media.error.title"),
            "error",
            String(error)
          );
        });
    },
    [hwdecReloadRef, setLoadingFile]
  );

  const onSpeedStep = useCallback(
    (direction: number) => {
      onSpeed(stepSpeed(playbackAtoms.speed.get(), direction));
    },
    [onSpeed]
  );

  const onFrameStep = useCallback((forward: boolean) => {
    ignore(startFrameStep(forward));
  }, []);

  const onCycleSub = useCallback(() => {
    onCycleTrack("sub");
  }, [onCycleTrack]);

  const close = useCallback(() => {
    ignore(closePlayerWindow());
  }, []);

  const restart = useCallback(() => {
    setFinished(false);
    ignore(seekTo(0, "exact").then(() => setPaused(false)));
  }, [setFinished]);

  return {
    onPlay,
    onPause,
    onPlayPause,
    onFileNext,
    onFilePrev,
    onPlayIndex,
    onVolume,
    onMute,
    onSpeed,
    handleHwdec,
    onSpeedStep,
    onFrameStep,
    onCycleSub,
    restart,
    close,
  };
}
