export interface LanguageTag {
  code: string;
  label: string;
}
export type SortKey = "seeders" | "leechers" | "size";
export type SortDirection = "asc" | "desc";

export interface SettingsScraper {
  sort: SortKey;
}

export interface SearchFilters {
  minSeeders: number;
  hasMagnet: boolean;
  quality: string;
  language: string;
  sizeMin: number;
  sizeMax: number;
  codec: string;
}

export interface SearchQueryStat {
  count: number;
  lastUsedAt: number;
  selectedCount: number;
  ignoredCount?: number;
  lastIgnoredAt?: number;
}

export type SearchSuggestionScope = "anilist" | "torrent" | "player" | "filter";
export type AutocompleteMode = "inline" | "dropdown" | "both" | "off";
export type SearchSuggestionKind = "anime" | "history" | "local" | "torrent";
export type AnilistSuggestionBoost = "off" | "subtle" | "strong";

export interface SearchSuggestion {
  kind: SearchSuggestionKind;
  score: number;
  subtitle?: string;
  value: string;
}

export interface SearchSuggestionOptions {
  animeIndex?: SearchAnimeSuggestion[];
  extraValues?: Array<{ kind?: SearchSuggestionKind; value: string }>;
  history?: string[];
  limit?: number;
  queryStats?: Record<string, SearchQueryStat>;
  suggestionStats?: Record<string, SearchQueryStat>;
  scope?: SearchSuggestionScope;
  anilistBoost?: AnilistSuggestionBoost;
  backendSuggestions?: SearchSuggestion[];
  animeEnabled?: boolean;
}

export interface UnifiedIndexRow {
  id: string;
  kind: string;
  scope: string;
  value: string;
  subtitle?: string | null;
  useCount: number;
  selectedCount: number;
  ignoredCount: number;
  lastUsedAt: number;
}

export interface SearchAnimeSuggestion {
  id: number;
  title: string;
  aliases: string[];
  status: string;
  score: number | null;
  favourite: boolean;
  season?: string | null;
  seasonYear?: number | null;
}

export interface SearchLearningSnapshot {
  history: string[];
  queryStats: Record<string, SearchQueryStat>;
  suggestionStats: Record<string, SearchQueryStat>;
  animeIndex: SearchAnimeSuggestion[];
  animeProfileId: number | null;
  version?: number;
}

export interface SearchStore {
  history: string[];
  queryStats: Record<string, SearchQueryStat>;
  suggestionStats: Record<string, SearchQueryStat>;
  animeIndex: SearchAnimeSuggestion[];
  animeProfileId: number | null;
  crossSearchQuery: string | null;
  anilistSearchQuery: string | null;
  sortBy: SortKey;
  sortDirection: SortDirection;
  filters: SearchFilters;

  addQuery: (query: string, scope?: string) => void;
  recordSuggestion: (value: string) => void;
  recordSuggestionIgnored: (value: string) => void;
  indexAniList: (
    lists: import("./anilist").AniListCollection[],
    favourites: import("./anilist").FavouriteAnime[],
    profileId: number
  ) => void;
  clearAnimeIndex: () => void;
  resetAnimeSuggestions: () => void;
  removeQuery: (query: string) => void;
  setCrossSearchQuery: (query: string | null) => void;
  setAnilistSearchQuery: (query: string | null) => void;
  setSortBy: (sort: SortKey) => void;
  setSortDirection: (dir: SortDirection) => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
}

export type Source = "erai-raws" | "rutracker" | "nyaa" | "nekobt" | "sukebei";

export interface SourceInfo {
  value: Source;
  label: string;
  nsfw: boolean;
}
