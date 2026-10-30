import type { HotkeyRepeat } from "@/types/core/chordHotkeys";
import type { TranslationKey } from "@/types/core/i18n";

export type KeybindAction =
  | "playPause"
  | "seekForward"
  | "seekBackward"
  | "prevChapter"
  | "nextChapter"
  | "volumeUp"
  | "volumeDown"
  | "toggleMute"
  | "frameBackward"
  | "frameForward"
  | "subtitleOffsetDown"
  | "subtitleOffsetUp"
  | "subtitleOffsetDownFine"
  | "subtitleOffsetUpFine"
  | "audioOffsetDown"
  | "audioOffsetUp"
  | "audioOffsetDownFine"
  | "audioOffsetUpFine"
  | "resetDelays"
  | "toggleAutoHide"
  | "toggleDiagnostics"
  | "nextFile"
  | "prevFile"
  | "toggleCheatsheet"
  | "toggleFullscreen"
  | "toggleAlwaysOnTop"
  | "viewMinimal"
  | "viewCompact"
  | "viewNormal"
  | "exitCinemaMode"
  | "jumpToTime"
  | "saveCleanFrame"
  | "togglePlaylist"
  | "skipChapter"
  | "speedDown"
  | "speedUp"
  | "speedReset"
  | "cycleSubtitle"
  | "cycleAudio"
  | "seekToStart"
  | "seekToEnd"
  | "playlistDown"
  | "playlistUp"
  | "playlistActivate"
  | `seekPercent${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface KeybindDef {
  action: KeybindAction;
  chord: string;
  repeat: HotkeyRepeat;
  keys: string;
  description: TranslationKey;
  category: "playback" | "navigation" | "subtitles" | "ui";
}
