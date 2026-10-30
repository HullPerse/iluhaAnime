import type { AnimeDetailWidth } from "@/types/detail";

export const ANILIST_SIMILAR_LIMIT = 8;

/**
 * Width classes for the anime detail modal. `default` keeps the previous
 * `min-w-2xl` (672 px). `wide` raises the minimum and also the share of the
 * window the modal may take, so the extra width still shows on smaller screens
 * where the shared `max-w-[80%]` would otherwise cap it back to the old size.
 */
export const ANILIST_DETAIL_WIDTH_CLASS: Record<AnimeDetailWidth, string> = {
  default: "min-w-2xl",
  wide: "min-w-4xl max-w-[92%]",
};
