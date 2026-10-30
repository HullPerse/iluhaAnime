import { useCallback } from "react";

import { SEEK_STEP } from "@/config/settings/keybinds.config";
import { resolveChapterJump } from "@/lib/core/chapter.utils";
import { ignore } from "@/lib/core/promise.utils";
import { resolveSkipTarget } from "@/lib/core/skip.utils";
import { seekTo, setPaused } from "@/lib/player/playback.utils";
import { playbackAtoms, playerAtoms, setSeekTarget } from "@/store/player.store";
import type { ChapterJumpDirection } from "@/types/core/chapter";

interface SeekDeps {
  hasPrev: boolean;
  hasNext: boolean;
  onFileNext: () => void;
}

export function useSeekHandlers({ hasPrev, hasNext, onFileNext }: SeekDeps) {
  const onScrub = useCallback((time: number) => {
    setSeekTarget(time);
    ignore(seekTo(time, "keyframes"));
  }, []);

  const onCommitSeek = useCallback((time: number) => {
    setSeekTarget(time);
    ignore(seekTo(time, "exact"));
  }, []);

  const onSeekTo = useCallback((time: number) => {
    setSeekTarget(time);
    const mode = playerAtoms.seekMode.get();
    ignore(seekTo(time, mode));
  }, []);

  const onSeekBy = useCallback((seconds: number) => {
    const duration = playbackAtoms.duration.get();
    const timePos = playbackAtoms.timePos.get();
    const mode = playerAtoms.seekMode.get();
    const target = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, timePos + seconds));
    setSeekTarget(target);
    ignore(seekTo(target, mode));
  }, []);

  const onSkipChapter = useCallback((time: number) => {
    const wasPaused = playbackAtoms.paused.get();
    setSeekTarget(time);
    const mode = playerAtoms.seekMode.get();
    ignore(
      seekTo(time, mode).then(() => {
        if (!wasPaused) setPaused(false);
        return undefined;
      })
    );
  }, []);

  const onSeekPercent = useCallback(
    (percent: number) => {
      const total = playbackAtoms.duration.get();
      if (total <= 0) return;
      onSeekTo(total * (percent / 10));
    },
    [onSeekTo]
  );

  const onSkipShortcut = useCallback(() => {
    const skip = resolveSkipTarget(
      playbackAtoms.chapters.get(),
      playbackAtoms.timePos.get(),
      playbackAtoms.duration.get(),
      hasNext
    );
    if (!skip) return;
    onSkipChapter(skip.target);
    if (skip.nextEpisode) onFileNext();
  }, [hasNext, onFileNext, onSkipChapter]);

  const onChapterJump = useCallback(
    (direction: ChapterJumpDirection) => {
      const jump = resolveChapterJump({
        chapters: playbackAtoms.chapters.get(),
        timePos: playbackAtoms.timePos.get(),
        duration: playbackAtoms.duration.get(),
        hasPrev,
        hasNext,
        direction,
        step: SEEK_STEP,
      });
      if (jump.kind === "seek") onSeekTo(jump.time);
    },
    [hasPrev, hasNext, onSeekTo]
  );

  return {
    onScrub,
    onCommitSeek,
    onSeekTo,
    onSeekBy,
    onSkipChapter,
    onSeekPercent,
    onSkipShortcut,
    onChapterJump,
  };
}
