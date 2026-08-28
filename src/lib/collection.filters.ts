import type { CollectionFilters } from "@/types/collection";

export const DEFAULT_FILTERS: CollectionFilters = {
  ratingMin: null,
  yearFrom: null,
  yearTo: null,
  provider: "any",
  linked: "any",
  hasNote: "any",
};
