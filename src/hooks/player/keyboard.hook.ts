import { useCallback } from "react";

import { VOLUME_STEP } from "@/config/player/video.config";
import { SEEK_STEP } from "@/config/settings/keybinds.config";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { invokeTyped } from "@/lib/core/invoke.utils";
import { ignore } from "@/lib/core/promise.utils";
import { translate } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";
import { playbackAtoms, playerAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { ChapterJumpDirection } from "@/types/core/chapter";
import type { PlayerViewMode } from "@/types/player/videoPlayer";
import type { KeybindAction } from "@/types/ui/keybinds";

interface KeyboardActions {
  onPlayPause: () => void;
  onSeekBy: (seconds: number) => void;
  onChapterJump: (direction: ChapterJumpDirection) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  onFrameStep: (forward: boolean) => void;
  nudgeOffset: (kind: "sub" | "audio", direction: number, fine: boolean) => void;
  onResetDelays: () => void;
  onToggleAutoHide: () => void;
  onToggleDiagnostics: () => void;
  onToggleCheatsheet: () => void;
  onToggleFullscreen: () => void;
  onToggleAlwaysOnTop: (value: boolean) => void;
  onViewMode: (mode: PlayerViewMode) => void;
  onExitCinemaMode: () => void;
  onFileNext: () => void;
  onFilePrev: () => void;
  onTogglePlaylist: () => void;
  onSkipShortcut: () => void;
  onSpeedStep: (direction: number) => void;
  onCycleTrack: (kind: "audio" | "sub") => void;
  onSeekTo: (time: number) => void;
  onSeekPercent: (percent: number) => void;
  onOpenJump: () => void;
  onPlaylistFocus: (delta: number) => void;
  onPlaylistActivate: () => void;
}

export function usePlayerKeyboardActions(
  actions: KeyboardActions
): (action: KeybindAction) => void {
  const {
    onPlayPause,
    onSeekBy,
    onChapterJump,
    onVolume,
    onMute,
    onFrameStep,
    nudgeOffset,
    onResetDelays,
    onToggleAutoHide,
    onToggleDiagnostics,
    onToggleCheatsheet,
    onToggleFullscreen,
    onToggleAlwaysOnTop,
    onViewMode,
    onExitCinemaMode,
    onFileNext,
    onFilePrev,
    onTogglePlaylist,
    onSkipShortcut,
    onSpeedStep,
    onCycleTrack,
    onSeekTo,
    onSeekPercent,
    onOpenJump,
    onPlaylistFocus,
    onPlaylistActivate,
  } = actions;

  return useCallback(
    (action: KeybindAction) => {
      const table: Record<KeybindAction, () => void> = {
        playPause: onPlayPause,
        seekForward: () => onSeekBy(SEEK_STEP),
        seekBackward: () => onSeekBy(-SEEK_STEP),
        prevChapter: () => onChapterJump(-1),
        nextChapter: () => onChapterJump(1),
        volumeUp: () => onVolume(playerAtoms.volume.get() + VOLUME_STEP),
        volumeDown: () => onVolume(playerAtoms.volume.get() - VOLUME_STEP),
        toggleMute: onMute,
        frameBackward: () => onFrameStep(false),
        frameForward: () => onFrameStep(true),
        subtitleOffsetUp: () => nudgeOffset("sub", 1, false),
        subtitleOffsetDown: () => nudgeOffset("sub", -1, false),
        subtitleOffsetUpFine: () => nudgeOffset("sub", 1, true),
        subtitleOffsetDownFine: () => nudgeOffset("sub", -1, true),
        audioOffsetUp: () => nudgeOffset("audio", 1, false),
        audioOffsetDown: () => nudgeOffset("audio", -1, false),
        audioOffsetUpFine: () => nudgeOffset("audio", 1, true),
        audioOffsetDownFine: () => nudgeOffset("audio", -1, true),
        resetDelays: onResetDelays,
        toggleAutoHide: onToggleAutoHide,
        toggleDiagnostics: onToggleDiagnostics,
        nextFile: onFileNext,
        prevFile: onFilePrev,
        toggleCheatsheet: onToggleCheatsheet,
        toggleFullscreen: onToggleFullscreen,
        toggleAlwaysOnTop: () => onToggleAlwaysOnTop(!playerAtoms.alwaysOnTop.get()),
        viewMinimal: () => onViewMode("minimal"),
        viewCompact: () => onViewMode("compact"),
        viewNormal: () => onViewMode("normal"),
        jumpToTime: onOpenJump,
        exitCinemaMode: onExitCinemaMode,
        saveCleanFrame: () => {
          ignore(
            invokeTyped<{ path: string }>("player_save_frame").then(
              (saved) => {
                addNotification(
                  translate(settingsAtoms.language.get(), "player.media.frame.saved"),
                  "success",
                  saved.path
                );
                return null;
              },
              (error: unknown) => {
                reportBackgroundError("player.frame.save", error);
              }
            )
          );
        },
        togglePlaylist: onTogglePlaylist,
        skipChapter: onSkipShortcut,
        speedDown: () => onSpeedStep(-1),
        speedUp: () => onSpeedStep(1),
        speedReset: () => onSpeedStep(0),
        cycleSubtitle: () => onCycleTrack("sub"),
        cycleAudio: () => onCycleTrack("audio"),
        seekToStart: () => onSeekTo(0),
        seekToEnd: () => onSeekTo(playbackAtoms.duration.get()),
        seekPercent0: () => onSeekPercent(0),
        seekPercent1: () => onSeekPercent(1),
        seekPercent2: () => onSeekPercent(2),
        seekPercent3: () => onSeekPercent(3),
        seekPercent4: () => onSeekPercent(4),
        seekPercent5: () => onSeekPercent(5),
        seekPercent6: () => onSeekPercent(6),
        seekPercent7: () => onSeekPercent(7),
        seekPercent8: () => onSeekPercent(8),
        seekPercent9: () => onSeekPercent(9),
        playlistDown: () => onPlaylistFocus(1),
        playlistUp: () => onPlaylistFocus(-1),
        playlistActivate: onPlaylistActivate,
      };
      table[action]();
    },
    [
      onPlayPause,
      onSeekBy,
      onChapterJump,
      onVolume,
      onMute,
      onFrameStep,
      nudgeOffset,
      onResetDelays,
      onToggleAutoHide,
      onToggleDiagnostics,
      onToggleCheatsheet,
      onToggleFullscreen,
      onToggleAlwaysOnTop,
      onViewMode,
      onExitCinemaMode,
      onFileNext,
      onFilePrev,
      onTogglePlaylist,
      onSkipShortcut,
      onSpeedStep,
      onCycleTrack,
      onSeekTo,
      onSeekPercent,
      onOpenJump,
      onPlaylistFocus,
      onPlaylistActivate,
    ]
  );
}
