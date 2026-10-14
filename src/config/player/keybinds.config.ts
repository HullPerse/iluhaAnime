import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import type { HotkeyRepeat } from "@/lib/hotkeys/chord.hotkeys";
import type { TranslationKey } from "@/types/i18n";

export type KeybindAction =
  | "playPause"
  | "seekForward"
  | "seekBackward"
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
  // Ten entries, one per bare digit: `seekPercent5` jumps to 50%.
  | `seekPercent${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface KeybindDef {
  action: KeybindAction;
  chord: string;
  repeat: HotkeyRepeat;
  keys: string;
  description: TranslationKey;
  category: "playback" | "navigation" | "subtitles" | "ui";
}

export const SEEK_STEP = 5;
export const OFFSET_STEP = 0.5;
export const OFFSET_STEP_FINE = 0.05;
export const OFFSET_LIMIT = 300;

/** Bare `0`..`9` jump to 0%..90% of the file, MPC-style. */
function percentEntries(): KeybindDef[] {
  return DIGIT_KEYS.map((digit) => ({
    action: `seekPercent${digit}`,
    chord: `Digit${digit}`,
    repeat: "once",
    keys: `${digit}`,
    description: "player.media.key.seek.percent",
    category: "playback",
  }));
}

export const DIGIT_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const KEYBINDS: KeybindDef[] = [
  {
    action: "playPause",
    chord: "Space",
    repeat: "once",
    keys: "Space",
    description: "player.media.key.play.pause",
    category: "playback",
  },
  {
    action: "seekBackward",
    chord: "ArrowLeft",
    repeat: "hold",
    keys: "←",
    description: "player.media.key.seek.backward",
    category: "playback",
  },
  {
    action: "seekForward",
    chord: "ArrowRight",
    repeat: "hold",
    keys: "→",
    description: "player.media.key.seek.forward",
    category: "playback",
  },
  {
    action: "volumeUp",
    chord: "ArrowUp",
    repeat: "hold",
    keys: "↑",
    description: "player.media.key.volume.up",
    category: "playback",
  },
  {
    action: "volumeDown",
    chord: "ArrowDown",
    repeat: "hold",
    keys: "↓",
    description: "player.media.key.volume.down",
    category: "playback",
  },
  {
    action: "toggleMute",
    chord: "KeyM",
    repeat: "once",
    keys: "M",
    description: "player.media.key.mute.toggle",
    category: "playback",
  },
  {
    action: "frameBackward",
    chord: "Comma",
    repeat: "hold",
    keys: ",",
    description: "player.media.key.frame.backward",
    category: "playback",
  },
  {
    action: "frameForward",
    chord: "Period",
    repeat: "hold",
    keys: ".",
    description: "player.media.key.frame.forward",
    category: "playback",
  },
  {
    action: "subtitleOffsetDown",
    chord: "F1",
    repeat: "hold",
    keys: "F1",
    description: "player.media.key.subtitle.offset.down",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetUp",
    chord: "F2",
    repeat: "hold",
    keys: "F2",
    description: "player.media.key.subtitle.offset.up",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetDownFine",
    chord: "ctrl+F1",
    repeat: "hold",
    keys: "Ctrl+F1",
    description: "player.media.key.subtitle.offset.down.fine",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetUpFine",
    chord: "ctrl+F2",
    repeat: "hold",
    keys: "Ctrl+F2",
    description: "player.media.key.subtitle.offset.up.fine",
    category: "subtitles",
  },
  {
    action: "audioOffsetDown",
    chord: "F3",
    repeat: "hold",
    keys: "F3",
    description: "player.media.key.audio.offset.down",
    category: "subtitles",
  },
  {
    action: "audioOffsetUp",
    chord: "F4",
    repeat: "hold",
    keys: "F4",
    description: "player.media.key.audio.offset.up",
    category: "subtitles",
  },
  {
    action: "audioOffsetDownFine",
    chord: "ctrl+F3",
    repeat: "hold",
    keys: "Ctrl+F3",
    description: "player.media.key.audio.offset.down.fine",
    category: "subtitles",
  },
  {
    action: "audioOffsetUpFine",
    chord: "ctrl+F4",
    repeat: "hold",
    keys: "Ctrl+F4",
    description: "player.media.key.audio.offset.up.fine",
    category: "subtitles",
  },
  {
    action: "resetDelays",
    chord: "F5",
    repeat: "once",
    keys: "F5",
    description: "player.media.key.delays.reset",
    category: "subtitles",
  },
  {
    action: "toggleAutoHide",
    chord: "ctrl+KeyH",
    repeat: "once",
    keys: "Ctrl+H",
    description: "player.media.key.autohide.toggle",
    category: "ui",
  },
  {
    action: "toggleDiagnostics",
    chord: "KeyI",
    repeat: "once",
    keys: "I",
    description: "player.media.key.diagnostics.toggle",
    category: "ui",
  },
  {
    action: "nextFile",
    chord: "PageDown",
    repeat: "hold",
    keys: "PageDown",
    description: "player.media.key.file.next",
    category: "navigation",
  },
  {
    action: "prevFile",
    chord: "PageUp",
    repeat: "hold",
    keys: "PageUp",
    description: "player.media.key.file.prev",
    category: "navigation",
  },
  {
    action: "toggleFullscreen",
    chord: "KeyF",
    repeat: "once",
    keys: "F",
    description: "player.media.key.fullscreen.toggle",
    category: "ui",
  },
  {
    action: "toggleCheatsheet",
    chord: "Shift+Slash",
    repeat: "once",
    keys: "?",
    description: "player.media.key.cheatsheet.toggle",
    category: "ui",
  },
  {
    action: "exitCinemaMode",
    chord: "Escape",
    repeat: "once",
    keys: "Esc",
    description: "player.media.key.exit",
    category: "ui",
  },
  {
    action: "jumpToTime",
    chord: "ctrl+KeyG",
    repeat: "once",
    keys: "Ctrl+G",
    description: "player.media.key.jump.to.time",
    category: "playback",
  },
  {
    action: "saveCleanFrame",
    chord: "ctrl+Shift+KeyO",
    repeat: "hold",
    keys: "Ctrl+Shift+O",
    description: "player.media.key.frame.save",
    category: "playback",
  },
  {
    action: "togglePlaylist",
    chord: "KeyL",
    repeat: "once",
    keys: "L",
    description: "player.media.playlist.toggle",
    category: "ui",
  },
  {
    action: "skipChapter",
    chord: "KeyN",
    repeat: "once",
    keys: "N",
    description: "player.media.skip.chapter",
    category: "navigation",
  },
  {
    action: "speedDown",
    chord: "Shift+Comma",
    repeat: "once",
    keys: "Shift+,",
    description: "player.media.key.speed.down",
    category: "playback",
  },
  {
    action: "speedUp",
    chord: "Shift+Period",
    repeat: "once",
    keys: "Shift+.",
    description: "player.media.key.speed.up",
    category: "playback",
  },
  {
    action: "speedReset",
    chord: "KeyR",
    repeat: "once",
    keys: "R",
    description: "player.media.key.speed.reset",
    category: "playback",
  },
  {
    action: "cycleSubtitle",
    chord: "KeyV",
    repeat: "once",
    keys: "V",
    description: "player.media.key.subtitle.cycle",
    category: "subtitles",
  },
  {
    action: "cycleAudio",
    chord: "KeyB",
    repeat: "once",
    keys: "B",
    description: "player.media.key.audio.cycle",
    category: "subtitles",
  },
  {
    action: "seekToStart",
    chord: "Home",
    repeat: "once",
    keys: "Home",
    description: "player.media.key.seek.start",
    category: "playback",
  },
  {
    action: "seekToEnd",
    chord: "End",
    repeat: "once",
    keys: "End",
    description: "player.media.key.seek.end",
    category: "playback",
  },
  // Only act while the playlist panel is open (see `onKeyboardAction`), so the
  // arrows keep meaning seek and volume everywhere else.
  {
    action: "playlistDown",
    chord: "KeyJ",
    repeat: "hold",
    keys: "J",
    description: "player.media.key.playlist.down",
    category: "navigation",
  },
  {
    action: "playlistUp",
    chord: "KeyK",
    repeat: "hold",
    keys: "K",
    description: "player.media.key.playlist.up",
    category: "navigation",
  },
  {
    action: "playlistActivate",
    chord: "Enter",
    repeat: "once",
    keys: "Enter",
    description: "player.media.key.playlist.activate",
    category: "navigation",
  },
  ...percentEntries(),
];

export const PLAYER_HOTKEYS: ResolvedHotkeyDef<KeybindAction>[] = KEYBINDS.map((keybind) => ({
  id: keybind.action,
  chord: keybind.chord,
  repeat: keybind.repeat,
  keybindId: `player.${keybind.action}`,
}));
