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

export interface CollectionGroup {
  status: CollectionStatusDef;
  items: CollectionItem[];
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
    stills?: string[];
    trailerYoutubeId?: string | null;
    staff?: Array<{ id: number; name: string; role: string }>;
    characters?: Array<{
      id: number;
      name: string;
      voiceActors: Array<{ id: number; name: string }>;
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

export interface WizardPrefill {
  title: string;
  coverUrl: string | null;
  status: CollectionStatus;
}

export interface CollectionStore {
  selectedStatus: CollectionStatus | "all";
  searchQuery: string;
  sortBy: "date" | "name" | "rating";
  sortDir: "asc" | "desc";
  filters: CollectionFilters;
  groupByStatus: boolean;
  collapsedStatuses: Set<string>;
  viewMode: "grid" | "list";
  displayMode: "scroll" | "pagination";
  wizardPrefill: WizardPrefill | null;
  setSearchQuery: (query: string) => void;
  setSelectedStatus: (status: CollectionStore["selectedStatus"]) => void;
  setSort: (by: CollectionStore["sortBy"], dir: CollectionStore["sortDir"]) => void;
  setFilters: (patch: Partial<CollectionFilters>) => void;
  setGroupByStatus: (groupByStatus: boolean) => void;
  toggleStatusCollapsed: (statusId: string) => void;
  setViewMode: (mode: CollectionStore["viewMode"]) => void;
  setDisplayMode: (mode: CollectionStore["displayMode"]) => void;
  requestWizardPrefill: (prefill: WizardPrefill) => void;
  consumeWizardPrefill: () => void;
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

export interface CollectionSearchIndex {
  items: CollectionItem[];
  byToken: Map<string, Set<number>>;
  normalized: Array<{
    title: string;
    altTitles: string[];
    genres: string[];
    studio: string;
    people: string;
  }>;
}

export interface ImportBatchGroup {
  name: string;
  count: number;
}

export type WizardSaveValues = {
  title: string;
  altTitles: string;
  type: CollectionItem["type"];
  status: CollectionStatus;
  progressValue: string;
  progressTotal: string;
  progressUnit: CollectionItem["progressUnit"];
  durationMinutes: string;
  rating: string;
  priority: CollectionItem["priority"];
  isFavorite: boolean;
  year: string;
  genres: string;
  studio: string;
  description: string;
  notes: string;
  coverUrl: string;
  externalIds: CollectionItem["externalIds"];
  customFields: Record<string, unknown>;
  localPath: string;
  localKind: CollectionItem["localKind"];
  startedAt: string;
  finishedAt: string;
};

export type WizardSearchResult = {
  id: number;
  title: string;
  cover_url: string | null;
  year?: number;
  duration?: number | null;
  episodes?: number | null;
  genres?: string[];
  tags?: string[];
  studio?: string | null;
  mediaType?: string;
  altTitles?: string[];
  description?: string;
};

export type TmdbRateLimit = {
  remaining: number | null;
  resetAt: number | null;
  retryAfterSecs: number | null;
};

export interface GridLayout {
  columns: number;
  columnWidth: number;
}

export type GridVirtualRow =
  | { kind: "header"; status: CollectionStatusDef }
  | { kind: "grid"; items: CollectionItem[] };

export type GroupedRow =
  | { kind: "header"; status: CollectionStatusDef }
  | { kind: "item"; item: CollectionItem };

export type WizardTab = "source" | "details" | "cover" | "local";

export type FilterParams = CollectionFilters;

export interface CollectionDataState {
  items: CollectionItem[];
  customFieldDefs: CustomFieldDef[];
  statuses: CollectionStatusDef[];
}

export interface RawCollectionItem extends Omit<
  CollectionItem,
  "isFavorite" | "sitesToView" | "tvCurrentSeason" | "tvCurrentEpisode" | "detailsJson"
> {
  isFavorite: boolean | number;
  sitesToView?: unknown;
  tvCurrentSeason?: number | null;
  tvCurrentEpisode?: number | null;
  detailsJson?: unknown;
}

export interface CollectionCardProps {
  item: CollectionItem;
  statuses: CollectionStatusDef[];
  selected?: boolean;
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}

export interface GridCollectionProps {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  display: CollectionStore["displayMode"];
  selectedId?: string | null;
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
  groups?: CollectionGroup[];
  collapsedStatuses?: Set<string>;
  onToggleStatusCollapsed?: (statusId: string) => void;
}

export interface CollectionRowProps {
  item: CollectionItem;
  statuses: CollectionStatusDef[];
  selected?: boolean;
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}
