import type { TranslationKey } from "@/types/i18n";
import type { HotkeyDef, HotkeyRepeat } from "@/lib/hotkeys/chord.hotkeys";

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
  | "saveCleanFrame";

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
];

export const PLAYER_HOTKEYS: HotkeyDef<KeybindAction>[] = KEYBINDS.map((keybind) => ({
  id: keybind.action,
  chord: keybind.chord,
  repeat: keybind.repeat,
}));
