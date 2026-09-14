export const CORE_DEFAULT_LABELS: Record<string, string> = {
  favorites: "Favorites",
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
  rewatching: "Rewatching",
};

export const WIZARD_SEARCH_DEBOUNCE_MS = 350;
export const WIZARD_COVER_MAX = 8;
export const TMDB_LIMIT = 40;

export const WIZARD_TABS = [
  { id: "source", labelKey: "collection.wizard.source" },
  { id: "details", labelKey: "collection.wizard.details" },
  { id: "cover", labelKey: "collection.wizard.cover" },
  { id: "local", labelKey: "collection.wizard.local" },
] as const;

export const IMPORT_CHUNK_SIZE = 100;
export const FIELD_TYPES = ["text", "number", "select", "date"] as const;
export const SIMILAR_COUNT = 4;
export const WIZARD_HISTORY_COUNT = 6;
