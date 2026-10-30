import { KEYBINDS } from "@/config/keybinds.config";
import { SCREENSHOT_HISTORY_DEFS } from "@/config/screenshot.config";
import { TAB_KEYS } from "@/config/tabs.config";
import type { KeybindManifestEntry, KeybindScope } from "@/types/manifest";

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
  const primary = new Map<string, (typeof SCREENSHOT_HISTORY_DEFS)[number]>();
  for (const def of SCREENSHOT_HISTORY_DEFS) {
    if (!primary.has(def.id)) primary.set(def.id, def);
  }
  return [...primary.values()].map((def) => ({
    id: `screenshot.history.${def.id}`,
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
    id: "focus.main",
    chord: "ctrl+KeyK",
    repeat: "once",
    scope: "global",
    mode: "base",
    description: "keybind.focus.main",
    category: "interface",
  },
  {
    id: "tab.prev",
    chord: "Shift+BracketLeft",
    repeat: "once",
    scope: "global",
    mode: "base",
    description: "keybind.tab.prev",
    category: "navigation",
  },
  {
    id: "tab.next",
    chord: "Shift+BracketRight",
    repeat: "once",
    scope: "global",
    mode: "base",
    description: "keybind.tab.next",
    category: "navigation",
  },
  {
    id: "player.toggle.queue",
    chord: "KeyQ",
    repeat: "once",
    scope: "player",
    mode: "base",
    description: "keybind.player.toggle.queue",
    category: "interface",
  },
  {
    id: "folder.shrink",
    chord: "BracketLeft",
    repeat: "hold",
    scope: "player",
    mode: "base",
    description: "keybind.folder.shrink",
    category: "interface",
  },
  {
    id: "folder.grow",
    chord: "BracketRight",
    repeat: "hold",
    scope: "player",
    mode: "base",
    description: "keybind.folder.grow",
    category: "interface",
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
  {
    id: "torrent.pause.resume",
    chord: "KeyP",
    repeat: "once",
    scope: "global",
    mode: "base",
    description: "keybind.torrent.pause.resume",
    category: "interface",
  },
  {
    id: "torrent.recheck.errors",
    chord: "KeyC",
    repeat: "once",
    scope: "global",
    mode: "base",
    description: "keybind.torrent.recheck.errors",
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
