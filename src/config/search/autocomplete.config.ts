import { Film, HardDrive, History, Magnet, SpellCheck, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/types/i18n";
import type { SearchSuggestion } from "@/types/search";

export const AUTOCOMPLETE_HISTORY_LIMIT = 12;
export const SPELL_CORRECTION_LIMIT = 3;

export const suggestionIcons: Record<SearchSuggestion["kind"], LucideIcon> = {
  anime: Film,
  history: History,
  local: HardDrive,
  torrent: Magnet,
  spell: SpellCheck,
};

export const suggestionKindLabels: Record<SearchSuggestion["kind"], TranslationKey> = {
  anime: "search.suggestion.anime",
  history: "search.suggestion.history",
  local: "search.suggestion.local",
  torrent: "search.suggestion.torrent",
  spell: "search.suggestion.spell",
};

export const KIND_ORDER: SearchSuggestion["kind"][] = ["spell", "anime", "history", "local", "torrent"];
