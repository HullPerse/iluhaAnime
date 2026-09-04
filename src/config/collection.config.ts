import type { CollectionConfig } from "@/types/collection";

export const CARD_W = 168;
export const CARD_H = 260;
export const CARD_POSTER_H = 192;

export const ONE_DAY_MS = 86_400_000;

export const CORE_DEFAULT_LABELS: Record<string, string> = {
  favorites: "Favorites",
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
  rewatching: "Rewatching",
};

export const COLLECTION_DEFAULT_CONFIG = {
  STATUS: "all",
  SORT: "date",
  DIR: "desc",
} as const satisfies CollectionConfig;

export const WIZARD_SEARCH_DEBOUNCE_MS = 350;
export const WIZARD_COVER_MAX = 8;
export const TMDB_LIMIT = 40;
