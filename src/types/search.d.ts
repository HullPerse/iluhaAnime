import type { AniListCollection, FavouriteAnime } from "./anilist";
import type { SearchField } from "./collection";
import type { Anime } from "./torrent";

export interface LanguageTag {
  code: string;
  label: string;
}
export type SortKey = "seeders" | "leechers" | "size";
export type SortDirection = "asc" | "desc";
export type SearchType = "default" | "modern";

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

export interface CollectionSuggestionItem {
  title: string;
  altTitles?: string[];
  subtitle?: string;
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
  collectionItems?: CollectionSuggestionItem[];
  collectionBoost?: number;
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
  hasFavPeople?: boolean;
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
  favPeopleAnimeIds: number[];
  crossSearchQuery: string | null;
  anilistSearchQuery: string | null;
  sortBy: SortKey;
  sortDirection: SortDirection;
  filters: SearchFilters;

  addQuery: (query: string, scope?: string) => void;
  recordSuggestion: (value: string) => void;
  recordSuggestionIgnored: (value: string) => void;
  indexAniList: (
    lists: AniListCollection[],
    favourites: FavouriteAnime[],
    profileId: number,
    favPeopleAnimeIds?: Set<number>
  ) => void;
  clearAnimeIndex: () => void;
  resetAnimeSuggestions: () => void;
  removeQuery: (query: string) => void;
  purgeExpired: () => void;
  clearScope: (scope: string) => Promise<void>;
  clearAllLearning: () => Promise<void>;
  setCrossSearchQuery: (query: string | null) => void;
  setFavPeopleAnimeIds: (ids: number[]) => void;
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

export type CompareOp = ":" | "=" | ">" | ">=" | "<" | "<=" | "!=";

export interface NumericCond {
  op: ">" | ">=" | "<" | "<=" | "!=";
  value: number;
}

export interface NegationCond {
  key: string;
  value: string;
}

export interface ParsedIntent {
  cleanQuery: string;
  year?: number;
  studio?: string;
  genre?: string;
  type?: string;
  status?: string;
  rating?: number;
  episodes?: number;
  progress?: number;
  priority?: string;
  sortBy?: "date" | "name" | "rating";
  sortDir?: "asc" | "desc";
  provider?: string;
  yearOps: NumericCond[];
  ratingOps: NumericCond[];
  episodesOps: NumericCond[];
  progressOps: NumericCond[];
  negations: NegationCond[];
  rawFilters: Record<string, string>;
}

export interface IntentToken {
  start: number;
  end: number;
  key: string;
  op: CompareOp;
  value: string;
}

export interface HighlightRange {
  start: number;
  end: number;
}

export interface SuggestionSection {
  kind: SearchSuggestionKind;
  startIndex: number;
  endIndex: number;
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

export interface HighlightToken {
  text: string;
  highlighted: boolean;
}

export type EraiErrorCode =
  | "webview_open"
  | "webview_save"
  | "webview_not_found"
  | "no_session"
  | "network";

export type RutrackerErrorCode =
  | "wrong_credentials"
  | "blocked"
  | "network"
  | "login_failed"
  | "session_failed"
  | "cookies_invalid"
  | "cookies_parse"
  | "webview_open"
  | "webview_save"
  | "webview_not_found"
  | "no_cookies"
  | "no_session";

export interface AutocompleteParams {
  query: string;
  scope: SearchSuggestionScope;
  history?: string[];
  queryStats?: SearchSuggestionOptions["queryStats"];
  suggestionStats?: SearchSuggestionOptions["suggestionStats"];
  animeIndex?: SearchSuggestionOptions["animeIndex"];
  animeProfileId?: number | null;
  anilistBoost?: SearchSuggestionOptions["anilistBoost"];
  extraValues?: SearchSuggestionOptions["extraValues"];
  collectionItems?: SearchSuggestionOptions["collectionItems"];
  collectionBoost?: number;
  limit?: number;
}

export type SearchPersistedState = Pick<
  SearchStore,
  | "animeIndex"
  | "animeProfileId"
  | "filters"
  | "history"
  | "queryStats"
  | "sortBy"
  | "sortDirection"
  | "suggestionStats"
>;
export interface AuthSearchProps {
  source: string;
  rutrackerAuth: boolean;
  nekobtAuth: boolean;
  eraiAuth: boolean;
  onLoginOpen: () => void;
  onApiModalOpen: () => void;
  onEraiLoginOpen: () => void;
  onLogout: () => Promise<void>;
  onNekoBtLogout: () => Promise<void>;
  onEraiLogout: () => Promise<void>;
  layout?: "toolbar" | "titlebar";
}

export interface TorrentDetailsProps {
  item: Anime;
  source: Source;
  magnets: Record<string, string>;
  loadingMagnet: Record<string, boolean>;
  onClose: () => void;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
}

export interface SearchFiltersProps {
  sort: SortKey;
  direction: SortDirection;
  activeFilterCount: number;
  onSortChange: (sort: SortKey) => void;
  onDirectionChange: () => void;
  onOpenFilters: () => void;
}
export interface ModalFiltersProps {
  open: boolean;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onReset: () => void;
  onClose: () => void;
  sort?: SortKey;
  direction?: SortDirection;
  onSortChange?: (sort: SortKey) => void;
  onDirectionChange?: () => void;
}

export interface ResultSearchProps {
  item: Anime;
  source: string;
  loadingMagnet: Record<string, boolean>;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onOpenLink: (item: Anime) => void;
  onOpenDetails: (item: Anime) => void;
}

export interface SelectedSearchTorrent {
  item: Anime;
  source: Source;
}

export interface SearchQueryController {
  source: Source;
  sourceOptions: { value: string; label: string }[];
  isLoading: boolean;
  searchParams: string;
  submittedQuery: string;
  field: SearchField;
  handleSearch: () => void;
  resetSearch: () => void;
  changeSource: (value: string) => void;
  sortBy: SortKey;
  sortDirection: SortDirection;
  setSortBy: (sort: SortKey) => void;
  toggleSortDirection: () => void;
  filters: SearchFilters;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  activeFilterCount: number;
  showFilters: boolean;
  setShowFilters: (open: boolean) => void;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  data: Anime[] | undefined;
  displayItems: Anime[] | undefined;
  isPagedSource: boolean;
  nyaaPage: number;
  setNyaaPage: (page: number) => void;
  resultsPerPage: number;
  rutrackerAuth: boolean;
  nekobtAuth: boolean;
  eraiAuth: boolean;
  showLogin: boolean;
  showEraiLogin: boolean;
  showApiModal: boolean;
  setShowLogin: (open: boolean) => void;
  setShowEraiLogin: (open: boolean) => void;
  setShowApiModal: (open: boolean) => void;
  handleLogout: () => Promise<void>;
  handleNekoBtLogout: () => Promise<void>;
  handleEraiLogout: () => Promise<void>;
  onAuthenticated: () => void;
  magnets: Record<string, string>;
  loadingMagnet: Record<string, boolean>;
  copyMagnetFor: (item: Anime) => void;
  openMagnetFor: (item: Anime) => void;
  downloadMagnetFor: (item: Anime) => Promise<void>;
  selectedTorrent: SelectedSearchTorrent | null;
  setSelectedTorrent: (selection: SelectedSearchTorrent | null) => void;
}
