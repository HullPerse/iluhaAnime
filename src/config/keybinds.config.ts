export type KeybindAction =
  | "setSearch"
  | "setTorrent"
  | "setPlayer"
  | "setAnilist";

export interface KeybindDef {
  action: KeybindAction;
  code: string;
  keys: string;
  description: string;
  category: "navigation";
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

const KEYBINDS: KeybindDef[] = [
  {
    action: "setSearch",
    code: "Digit1",
    keys: "Alt+1",
    description: "Поиск",
    category: "navigation",
    alt: true,
  },
  {
    action: "setTorrent",
    code: "Digit2",
    keys: "Alt+2",
    description: "Торренты",
    category: "navigation",
    alt: true,
  },
  {
    action: "setPlayer",
    code: "Digit3",
    keys: "Alt+3",
    description: "Плеер",
    category: "navigation",
    alt: true,
  },
  {
    action: "setAnilist",
    code: "Digit4",
    keys: "Alt+4",
    description: "AniList",
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


