import type { HotkeyRepeat } from "@/types/core/chordHotkeys";
import type { TranslationKey } from "@/types/core/i18n";

export type KeybindScope = "global" | "settings" | "player" | "vim" | "find" | "menu" | "tree";

type KeybindMode = "base" | "vim";

type KeybindCategory =
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
