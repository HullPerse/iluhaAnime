import { Film, HardDrive, History, Magnet, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";

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
