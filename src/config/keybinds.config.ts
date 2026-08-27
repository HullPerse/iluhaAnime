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
    alt: true,
    category: "navigation",
    code: "Digit1",
    description: "app.search",
    keys: "Alt+1",
  },
  {
    action: "setTorrent",
    alt: true,
    category: "navigation",
    code: "Digit2",
    description: "app.torrent",
    keys: "Alt+2",
  },
  {
    action: "setPlayer",
    alt: true,
    category: "navigation",
    code: "Digit3",
    description: "app.player",
    keys: "Alt+3",
  },
  {
    action: "setAnilist",
    alt: true,
    category: "navigation",
    code: "Digit4",
    description: "app.anilist",
    keys: "Alt+4",
  },
];

const codeMap = new Map<string, KeybindDef>();

for (const kb of KEYBINDS) {
  codeMap.set(
    `${kb.code}:${kb.ctrl ?? false}:${kb.shift ?? false}:${kb.alt ?? false}`,
    kb
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
