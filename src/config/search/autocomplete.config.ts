import { Film, HardDrive, History, Magnet, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/types/i18n";
import type { SearchSuggestion } from "@/types/search";

export const AUTOCOMPLETE_HISTORY_LIMIT = 12;

export const suggestionIcons: Record<SearchSuggestion["kind"], LucideIcon> = {
  anime: Film,
  history: History,
  local: HardDrive,
  torrent: Magnet,
};

export const suggestionKindLabels: Record<SearchSuggestion["kind"], TranslationKey> = {
  anime: "search.suggestion.anime",
  history: "search.suggestion.history",
  local: "search.suggestion.local",
  torrent: "search.suggestion.torrent",
};

export const KIND_ORDER: SearchSuggestion["kind"][] = ["anime", "history", "local", "torrent"];
