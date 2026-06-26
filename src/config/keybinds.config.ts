export type KeybindAction =
  | "playPause"
  | "seekForward"
  | "seekBackward"
  | "volumeUp"
  | "volumeDown"
  | "frameBackward"
  | "frameForward"
  | "subtitleOffsetDown"
  | "subtitleOffsetUp"
  | "subtitleOffsetDownFine"
  | "subtitleOffsetUpFine"
  | "toggleAutoHide"
  | "nextFile"
  | "prevFile"
  | "toggleCheatsheet"
  | "exitCinemaMode"
  | "setSearch"
  | "setTorrent"
  | "setPlayer"
  | "setAnilist";

export interface KeybindDef {
  action: KeybindAction;
  code: string;
  keys: string;
  description: string;
  category: "playback" | "navigation" | "subtitles" | "ui";
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export const KEYBINDS: KeybindDef[] = [
  {
    action: "playPause",
    code: "Space",
    keys: "Space",
    description: "Пауза",
    category: "playback",
  },
  {
    action: "seekBackward",
    code: "ArrowLeft",
    keys: "←",
    description: "Назад 5с",
    category: "playback",
  },
  {
    action: "seekForward",
    code: "ArrowRight",
    keys: "→",
    description: "Вперёд 5с",
    category: "playback",
  },
  {
    action: "volumeUp",
    code: "ArrowUp",
    keys: "↑",
    description: "Громкость +",
    category: "playback",
  },
  {
    action: "volumeDown",
    code: "ArrowDown",
    keys: "↓",
    description: "Громкость -",
    category: "playback",
  },
  {
    action: "frameBackward",
    code: "Comma",
    keys: ",",
    description: "Кадр назад",
    category: "playback",
  },
  {
    action: "frameForward",
    code: "Period",
    keys: ".",
    description: "Кадр вперёд",
    category: "playback",
  },
  {
    action: "subtitleOffsetDown",
    code: "F1",
    keys: "F1",
    description: "Субтитры -500ms",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetUp",
    code: "F2",
    keys: "F2",
    description: "Субтитры +500ms",
    category: "subtitles",
  },
  {
    action: "subtitleOffsetDownFine",
    code: "F1",
    keys: "Ctrl+F1",
    description: "Субтитры -50ms",
    category: "subtitles",
    ctrl: true,
  },
  {
    action: "subtitleOffsetUpFine",
    code: "F2",
    keys: "Ctrl+F2",
    description: "Субтитры +50ms",
    category: "subtitles",
    ctrl: true,
  },
  {
    action: "toggleAutoHide",
    code: "KeyH",
    keys: "Ctrl+H",
    description: "Авто-скрытие",
    category: "ui",
    ctrl: true,
  },
  {
    action: "nextFile",
    code: "PageDown",
    keys: "PageDown",
    description: "След. файл",
    category: "navigation",
  },
  {
    action: "prevFile",
    code: "PageUp",
    keys: "PageUp",
    description: "Пред. файл",
    category: "navigation",
  },
  {
    action: "toggleCheatsheet",
    code: "Slash",
    keys: "?",
    description: "Это окно",
    category: "ui",
    shift: true,
  },
  {
    action: "exitCinemaMode",
    code: "Escape",
    keys: "Esc",
    description: "Выйти из кинорежима",
    category: "ui",
  },

  {
    action: "setSearch",
    code: "Digit1",
    keys: "Alt+1",
    description: "Выбрать вкладку 1",
    category: "navigation",
    alt: true,
  },
  {
    action: "setTorrent",
    code: "Digit2",
    keys: "Ctrl+F1",
    description: "Выбрать вкладку 2",
    category: "navigation",
    alt: true,
  },
  {
    action: "setPlayer",
    code: "Digit3",
    keys: "Ctrl+F1",
    description: "Выбрать вкладку 3",
    category: "navigation",
    alt: true,
  },
  {
    action: "setAnilist",
    code: "Digit4",
    keys: "Ctrl+F1",
    description: "Выбрать вкладку 4",
    category: "navigation",
    alt: true,
  },
];

const codeMap = new Map<string, KeybindDef>();

for (const kb of KEYBINDS) {
  codeMap.set(
    `${kb.code}:${kb.ctrl ?? false}:${kb.shift ?? false}:${kb.alt ?? false}`,
    kb,
  );
}

export function getAction(
  code: string,
  ctrl: boolean,
  shift: boolean,
  alt: boolean,
): KeybindDef | undefined {
  return codeMap.get(`${code}:${ctrl}:${shift}:${alt}`);
}

export const CHEATSHEET_ROWS: { keys: string; description: string }[] = [
  { keys: "Space", description: "Пауза" },
  { keys: "← / →", description: "Назад / Вперёд 5с" },
  { keys: "↑ / ↓", description: "Громкость" },
  { keys: ", / .", description: "Кадр назад / вперёд" },
  { keys: "F1 / F2", description: "Субтитры -500/+500ms" },
  { keys: "Ctrl+F1/F2", description: "Субтитры -50/+50ms" },
  { keys: "PageUp / PageDown", description: "Пред. / След. файл" },
  { keys: "Ctrl+H", description: "Авто-скрытие" },
  { keys: "Ctrl+P", description: "Плейлист" },
  { keys: "?", description: "Это окно" },
];
