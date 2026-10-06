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
  | "saveCleanFrame";

export interface KeybindDef {
  action: KeybindAction;
  code: string;
  keys: string;
  description: TranslationKey;
  category: "playback" | "navigation" | "subtitles" | "ui";
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export const SEEK_STEP = 5;
export const OFFSET_STEP = 0.5;
export const OFFSET_STEP_FINE = 0.05;
export const OFFSET_LIMIT = 300;

export const KEYBINDS: KeybindDef[] = [
  {
    action: "playPause",
    code: "Space",
    keys: "Space",
    description: "player.media.key.play.pause",
    category: "playback",
  },
  {
    action: "seekBackward",
    code: "ArrowLeft",
    keys: "←",
    description: "player.media.key.seek.backward",
    category: "playback",
  },
  {
    action: "seekForward",
    code: "ArrowRight",
    keys: "→",
    description: "player.media.key.seek.forward",
    category: "playback",
  },
  {
    action: "volumeUp",
    code: "ArrowUp",
    keys: "↑",
    description: "player.media.key.volume.up",
    category: "playback",
  },
  {
    action: "volumeDown",
    code: "ArrowDown",
    keys: "↓",
    description: "player.media.key.volume.down",
    category: "playback",
  },
  {
    action: "toggleMute",
    code: "KeyM",
    keys: "M",
    description: "player.media.key.mute.toggle",
    category: "playback",
  },
  {
    action: "frameBackward",
    code: "Comma",
    keys: ",",
    description: "player.media.key.frame.backward",
    category: "playback",
  },
  {
    action: "frameForward",
    code: "Period",
    keys: ".",
    description: "player.media.key.frame.forward",
    category: "playback",
  },
  {
    action: "subtitleOffsetDown",
    code: "F1",
    keys: "F1",
    description: "player.media.key.subtitle.offset.down",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetUp",
    code: "F2",
    keys: "F2",
    description: "player.media.key.subtitle.offset.up",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetDownFine",
    code: "F1",
    keys: "Ctrl+F1",
    description: "player.media.key.subtitle.offset.down.fine",
    category: "subtitles",
    ctrl: true,
  },
  {
    action: "subtitleOffsetUpFine",
    code: "F2",
    keys: "Ctrl+F2",
    description: "player.media.key.subtitle.offset.up.fine",
    category: "subtitles",
    ctrl: true,
  },
  {
    action: "audioOffsetDown",
    code: "F3",
    keys: "F3",
    description: "player.media.key.audio.offset.down",
    category: "subtitles",
  },
  {
    action: "audioOffsetUp",
    code: "F4",
    keys: "F4",
    description: "player.media.key.audio.offset.up",
    category: "subtitles",
  },
  {
    action: "audioOffsetDownFine",
    code: "F3",
    keys: "Ctrl+F3",
    description: "player.media.key.audio.offset.down.fine",
    category: "subtitles",
    ctrl: true,
  },
  {
    action: "audioOffsetUpFine",
    code: "F4",
    keys: "Ctrl+F4",
    description: "player.media.key.audio.offset.up.fine",
    category: "subtitles",
    ctrl: true,
  },
  {
    action: "resetDelays",
    code: "F5",
    keys: "F5",
    description: "player.media.key.delays.reset",
    category: "subtitles",
  },
  {
    action: "toggleAutoHide",
    code: "KeyH",
    keys: "Ctrl+H",
    description: "player.media.key.autohide.toggle",
    category: "ui",
    ctrl: true,
  },
  {
    action: "toggleDiagnostics",
    code: "KeyI",
    keys: "I",
    description: "player.media.key.diagnostics.toggle",
    category: "ui",
  },
  {
    action: "nextFile",
    code: "PageDown",
    keys: "PageDown",
    description: "player.media.key.file.next",
    category: "navigation",
  },
  {
    action: "prevFile",
    code: "PageUp",
    keys: "PageUp",
    description: "player.media.key.file.prev",
    category: "navigation",
  },
  {
    action: "toggleFullscreen",
    code: "KeyF",
    keys: "F",
    description: "player.media.key.fullscreen.toggle",
    category: "ui",
  },
  {
    action: "toggleCheatsheet",
    code: "Slash",
    keys: "?",
    description: "player.media.key.cheatsheet.toggle",
    category: "ui",
    shift: true,
  },
  {
    action: "exitCinemaMode",
    code: "Escape",
    keys: "Esc",
    description: "player.media.key.exit",
    category: "ui",
  },
  {
    action: "jumpToTime",
    code: "KeyG",
    keys: "Ctrl+G",
    description: "player.media.key.jump.to.time",
    category: "playback",
    ctrl: true,
  },
  {
    action: "saveCleanFrame",
    code: "KeyO",
    keys: "Ctrl+Shift+O",
    description: "player.media.key.frame.save",
    category: "playback",
    ctrl: true,
    shift: true,
  },
];

const codeMap = new Map<string, KeybindDef>();

for (const keybind of KEYBINDS) {
  codeMap.set(
    `${keybind.code}:${keybind.ctrl ?? false}:${keybind.shift ?? false}:${keybind.alt ?? false}`,
    keybind
  );
}

export function getAction(
  code: string,
  ctrl: boolean,
  shift: boolean,
  alt: boolean
): KeybindDef | undefined {
  return codeMap.get(`${code}:${ctrl}:${shift}:${alt}`);
}

const HOTKEY_IGNORE_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [data-no-hotkeys], [data-hotkeys-disabled], [data-no-wheel]';

export function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(HOTKEY_IGNORE_SELECTOR));
}
