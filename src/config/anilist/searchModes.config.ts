import type { SearchMode } from "@/types/anilist/anilist";
import type { TranslationKey } from "@/types/core/i18n";

export const SEARCH_MODE_LABELS: Partial<Record<NonNullable<SearchMode>, TranslationKey>> = {
  studio: "anilist.route.studio",
  season: "anilist.route.season",
  tag: "anilist.route.tag",
};
