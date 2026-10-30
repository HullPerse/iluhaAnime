import { VIM_MOTION_KEYS } from "@/config/settings/vim.config";
import type { KeybindScope } from "@/types/core/manifest";

export const KEYBIND_SCOPES: readonly KeybindScope[] = [
  "global",
  "settings",
  "player",
  "vim",
  "find",
  "menu",
  "tree",
];

export const RESERVED_KEYBIND_CHORDS: readonly string[] = [VIM_MOTION_KEYS.firstPrefix];
