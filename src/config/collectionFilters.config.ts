import type { CollectionFilters } from "@/types/collection";

export const DEFAULT_FILTERS: CollectionFilters = {
  ratingMin: null,
  ratingMax: null,
  yearFrom: null,
  yearTo: null,
  provider: "any",
  linked: "any",
  hasNote: "any",
  mediaTypes: [],
  genres: [],
};

export const RATING_MIN = 0;
export const RATING_MAX = 10;
export const YEAR_MIN = 1874;
export const YEAR_MAX = new Date().getFullYear();
