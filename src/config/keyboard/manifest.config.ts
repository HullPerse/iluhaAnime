import { KEYBINDS } from "@/config/player/keybinds.config";
import { SCREENSHOT_HISTORY_DEFS } from "@/config/settings/screenshot.config";
import { TAB_KEYS } from "@/config/settings/tabs.config";
import type { HotkeyRepeat } from "@/lib/hotkeys/chord.hotkeys";
import type { TranslationKey } from "@/types/i18n";

export type KeybindScope = "global" | "settings" | "player" | "vim" | "find" | "menu" | "tree";

export type KeybindMode = "base" | "vim";

export type KeybindCategory =
  | "navigation"
  | "playback"
  | "subtitles"
  | "interface"
  | "search"
  | "screenshot"
  | "vim";

export interface KeybindManifestEntry {
  id: string;
  chord: string;
  repeat: HotkeyRepeat;
  scope: KeybindScope;
  mode: KeybindMode;
  description: TranslationKey;
  category: KeybindCategory;
}

function altDigitEntries(): KeybindManifestEntry[] {
  return TAB_KEYS.map((tab, index) => ({
    id: `tab.${tab.id}`,
    chord: `alt+Digit${index + 1}`,
    repeat: "once",
    scope: "global",
    mode: "base",
    description: tab.key,
    category: "navigation",
  }));
}

function screenshotHistoryEntries(): KeybindManifestEntry[] {
  return SCREENSHOT_HISTORY_DEFS.map((def) => ({
    id: `screenshot.${def.id}.${def.chord}`,
    chord: def.chord,
    repeat: def.repeat,
    scope: "global",
    mode: "base",
    description: def.id === "undo" ? "screenshot.undo" : "screenshot.redo",
    category: "screenshot",
  }));
}

function playerEntries(): KeybindManifestEntry[] {
  return KEYBINDS.map((keybind) => ({
    id: `player.${keybind.action}`,
    chord: keybind.chord,
    repeat: keybind.repeat,
    scope: "player",
    mode: "base",
    description: keybind.description,
    category: keybind.category === "ui" ? "interface" : keybind.category,
  }));
}

const VIM_ENTRIES: readonly KeybindManifestEntry[] = [
  {
    id: "vim.hints",
    chord: "KeyF",
    repeat: "once",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.hints",
    category: "vim",
  },
  {
    id: "vim.scroll.down",
    chord: "KeyJ",
    repeat: "hold",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.scroll.down",
    category: "vim",
  },
  {
    id: "vim.scroll.up",
    chord: "KeyK",
    repeat: "hold",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.scroll.up",
    category: "vim",
  },
  {
    id: "vim.scroll.half.down",
    chord: "KeyD",
    repeat: "hold",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.scroll.half.down",
    category: "vim",
  },
  {
    id: "vim.scroll.half.up",
    chord: "KeyU",
    repeat: "hold",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.scroll.half.up",
    category: "vim",
  },
  {
    id: "vim.last",
    chord: "Shift+KeyG",
    repeat: "once",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.last",
    category: "vim",
  },
  {
    id: "vim.edge.top",
    chord: "KeyH",
    repeat: "once",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.edge.top",
    category: "vim",
  },
  {
    id: "vim.edge.middle",
    chord: "KeyM",
    repeat: "once",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.edge.middle",
    category: "vim",
  },
  {
    id: "vim.edge.bottom",
    chord: "KeyL",
    repeat: "once",
    scope: "vim",
    mode: "vim",
    description: "keybind.vim.edge.bottom",
    category: "vim",
  },
];

/**
 * Folder/file tree keys (player folder tree, torrent file lists). They work
 * with vim off too - the ring is baseline keyboard - so mode stays base while
 * the tree scope keeps them out of every other surface in the future tab.
 * Sequences (`gg`) stay unlisted: no multi-stroke chord schema.
 */
const TREE_ENTRIES: readonly KeybindManifestEntry[] = [
  {
    id: "tree.move.down",
    chord: "KeyJ",
    repeat: "hold",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.move.down",
    category: "navigation",
  },
  {
    id: "tree.move.up",
    chord: "KeyK",
    repeat: "hold",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.move.up",
    category: "navigation",
  },
  {
    id: "tree.collapse",
    chord: "ArrowLeft",
    repeat: "hold",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.collapse",
    category: "navigation",
  },
  {
    id: "tree.expand",
    chord: "ArrowRight",
    repeat: "hold",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.expand",
    category: "navigation",
  },
  {
    id: "tree.activate",
    chord: "Enter",
    repeat: "once",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.activate",
    category: "navigation",
  },
  {
    id: "tree.external",
    chord: "KeyO",
    repeat: "once",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.external",
    category: "interface",
  },
  {
    id: "tree.builtin",
    chord: "KeyP",
    repeat: "once",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.builtin",
    category: "interface",
  },
  {
    id: "tree.search",
    chord: "KeyS",
    repeat: "once",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.search",
    category: "interface",
  },
  {
    id: "tree.upscale",
    chord: "KeyE",
    repeat: "once",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.upscale",
    category: "interface",
  },
  {
    id: "tree.reveal",
    chord: "KeyR",
    repeat: "once",
    scope: "tree",
    mode: "base",
    description: "keybind.tree.reveal",
    category: "interface",
  },
];

const APP_ENTRIES: readonly KeybindManifestEntry[] = [
  {
    id: "settings.find",
    chord: "ctrl+KeyK",
    repeat: "once",
    scope: "settings",
    mode: "base",
    description: "settings.find.placeholder",
    category: "search",
  },
  {
    id: "page.find",
    chord: "ctrl+KeyF",
    repeat: "once",
    scope: "find",
    mode: "base",
    description: "keybind.find.page",
    category: "search",
  },
  {
    id: "find.next",
    chord: "KeyN",
    repeat: "once",
    scope: "find",
    mode: "base",
    description: "keybind.find.next",
    category: "search",
  },
  {
    id: "find.prev",
    chord: "Shift+KeyN",
    repeat: "once",
    scope: "find",
    mode: "base",
    description: "keybind.find.prev",
    category: "search",
  },
  {
    id: "screenshot.capture",
    chord: "ctrl+Shift+KeyP",
    repeat: "once",
    scope: "global",
    mode: "base",
    description: "screenshot.title",
    category: "screenshot",
  },
  {
    id: "menu.close",
    chord: "Escape",
    repeat: "once",
    scope: "menu",
    mode: "base",
    description: "common.close",
    category: "interface",
  },
];

export const KEYBIND_MANIFEST: readonly KeybindManifestEntry[] = [
  ...altDigitEntries(),
  ...APP_ENTRIES,
  ...screenshotHistoryEntries(),
  ...playerEntries(),
  ...VIM_ENTRIES,
  ...TREE_ENTRIES,
];

export function keybindEntriesByScope(scope: KeybindScope): KeybindManifestEntry[] {
  return KEYBIND_MANIFEST.filter((entry) => entry.scope === scope);
}
