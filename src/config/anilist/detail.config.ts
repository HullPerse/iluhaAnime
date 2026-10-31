import type { AnimeDetailWidth } from "@/types/core/detail";

export const ANILIST_SIMILAR_LIMIT = 8;

export const ANILIST_DETAIL_WIDTH_CLASS: Record<AnimeDetailWidth, string> = {
  default: "min-w-2xl",
  wide: "min-w-4xl max-w-[92%]",
};

export const ANILIST_SIMILAR_SCROLL_STEP = 336;
