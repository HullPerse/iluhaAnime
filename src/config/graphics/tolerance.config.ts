import type { TagToleranceKey } from "@/types/search/search";

export const DEFAULT_TAG_TOLERANCES: Record<TagToleranceKey, number> = {
  episodes: 2,
  progress: 5,
  rating: 1,
  year: 2,
};
