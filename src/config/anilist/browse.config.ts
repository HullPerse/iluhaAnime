import type { BrowseTab } from "@/types/anilist";
import type { TranslationKey } from "@/types/i18n";

export const BROWSE_TABS: { id: BrowseTab; key: TranslationKey }[] = [
  { id: "popular", key: "anilist.browse.popular" },
  { id: "trending", key: "anilist.browse.trending" },
  { id: "top", key: "anilist.browse.top" },
];

export const BROWSE_SORT_MAP: Record<BrowseTab, string[]> = {
  popular: ["POPULARITY_DESC"],
  trending: ["TRENDING_DESC"],
  top: ["SCORE_DESC"],
};
