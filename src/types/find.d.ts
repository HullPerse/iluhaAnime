import type { TranslationKey } from "@/types/i18n";
import type { HighlightRange } from "@/types/search";

export type SettingsFindTab =
  | "general"
  | "notifications"
  | "search"
  | "torrent"
  | "theme"
  | "keybinds";

export type SettingsFindKind = "tab" | "section" | "setting";

export interface SettingsFindEntry {
  key: TranslationKey;
  tab: SettingsFindTab;
  sectionId: string;
  kind: SettingsFindKind;
}

export interface SettingsFindHit {
  entry: SettingsFindEntry;
  score: number;
  matchedRu: boolean;
  matchedEn: boolean;
  rangesRu: HighlightRange[];
  rangesEn: HighlightRange[];
}
