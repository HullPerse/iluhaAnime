/** Status ids are user-extensible since schema v5; core ids seeded in DB. */
export type CollectionStatus = string;
export type CollectionType = "anime" | "movie" | "series" | "custom";
export type ProgressUnit = "episodes" | "seasons" | "minutes" | "pages";
export type Priority = "low" | "normal" | "high";

export interface CollectionStatusDef {
  id: CollectionStatus;
  label: string;
  color: string;
  order: number;
  isCore: boolean;
}

export interface CollectionExternalIds {
  anilist?: number;
  mal?: number;
  tmdb?: number;
  imdb?: string;
}

export interface CollectionItem {
  id: string;
  title: string;
  altTitles: string[];
  type: CollectionType;
  status: CollectionStatus;
  progressValue: number;
  progressTotal: number | null;
  progressUnit: ProgressUnit;
  durationMinutes: number | null;
  rating: number | null;
  priority: Priority;
  isFavorite: boolean;
  year: number | null;
  genres: string[];
  studio: string | null;
  description: string | null;
  notes: string | null;
  coverUrl: string | null;
  coverBlobId: string | null;
  thumbBlobId: string | null;
  externalIds: CollectionExternalIds;
  customFields: Record<string, unknown>;
  localPath: string | null;
  localKind: "file" | "folder" | null;
  startedAt: number | null;
  finishedAt: number | null;
  lastWatchedAt: number | null;
  rewatchCount: number;
  addedAt: number;
  updatedAt: number;
  sitesToView: Array<{ url: string }>;
  tvCurrentSeason: number | null;
  tvCurrentEpisode: number | null;
  detailsJson: {
    seasons?: Array<{
      seasonNumber: number;
      episodeCount: number;
      name: string;
    }>;
  } | null;
}

export type CustomFieldType = "text" | "number" | "select" | "date";

export interface CustomFieldDef {
  id: string;
  name: string;
  fieldType: CustomFieldType;
  options: string[] | null;
}

export interface CollectionStats {
  total: number;
  byStatus: Record<CollectionStatus, number>;
  avgRating: number | null;
  totalHours: number;
  favoriteCount: number;
  ratingDistribution: Record<number, number>;
}

export interface CollectionStore {
  selectedStatus: CollectionStatus | "all";
  searchQuery: string;
  sortBy: "date" | "name" | "rating";
  sortDir: "asc" | "desc";
  filters: CollectionFilters;
  groupByStatus: boolean;
  collapsedStatuses: Set<string>;
  coverDithered: boolean;
  viewMode: "grid" | "list";
  displayMode: "scroll" | "pagination";
  setSearchQuery: (query: string) => void;
  setSelectedStatus: (status: CollectionStore["selectedStatus"]) => void;
  setSort: (by: CollectionStore["sortBy"], dir: CollectionStore["sortDir"]) => void;
  setFilters: (patch: Partial<CollectionFilters>) => void;
  setGroupByStatus: (groupByStatus: boolean) => void;
  toggleStatusCollapsed: (statusId: string) => void;
  setCoverDithered: (value: boolean) => void;
  setViewMode: (mode: CollectionStore["viewMode"]) => void;
  setDisplayMode: (mode: CollectionStore["displayMode"]) => void;
}

export interface CollectionFilters {
  ratingMin: number | null;
  ratingMax: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  provider: "any" | "anilist" | "tmdb" | "custom";
  linked: "any" | "yes" | "no";
  hasNote: "any" | "yes" | "no";
  mediaTypes: CollectionType[];
  genres: string[];
  hiddenStatuses?: string[];
  defaultStatus?: CollectionStatus;
}

export interface ReleaseSubscription {
  id: string;
  mediaId: number;
  mediaType: "movie" | "tv";
  title: string;
  lastCheckedAt: number | null;
  nextAiringAt: number | null;
  createdAt: number;
}

export type CollectionConfig = {
  STATUS: CollectionStatus | "all";
  SORT: "date" | "name" | "rating";
  DIR: "asc" | "desc";
};

export type SearchFieldParams = {
  scope: SearchSuggestionScope;
  query: string;
  setQuery: (value: string) => void;
  history?: string[];
  queryStats?: Record<string, SearchQueryStat>;
  suggestionStats?: Record<string, SearchQueryStat>;
  animeIndex?: SearchAnimeSuggestion[];
  animeProfileId?: number | null;
  anilistBoost?: AnilistSuggestionBoost;
  extraValues?: Array<{ kind?: SearchSuggestionKind; value: string }>;
  collectionItems?: CollectionSuggestionItem[];
  collectionBoost?: number;
  limit?: number;
  onSubmit?: (trimmed: string) => void;
  submitOnSelect?: boolean;
  historyScope?: string;
};

export interface SearchFieldInputProps {
  value: string;
  completion: string | null;
  suggestions: SearchSuggestion[];
  history: string[];
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAcceptCompletion: (value: string) => void;
  onDismissCompletion: () => void;
  onSelectSuggestion: (value: string) => void;
  onRemoveHistory: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export interface SearchField {
  suggestions: SearchSuggestion[];
  inlineCompletion: string | null;
  deferredQuery: string;
  history: string[];
  removeQuery: (query: string) => void;
  recordSuggestion: (value: string) => void;
  recordSuggestionIgnored: (value: string) => void;
  addQuery: (query: string, scope?: string) => void;
  handleSubmit: () => void;
  handleSelect: (value: string) => void;
  handleAcceptCompletion: (value: string) => void;
  handleDismissCompletion: () => void;
  inputProps: SearchFieldInputProps;
}
