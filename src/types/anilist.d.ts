import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import { RELATION_FILTERS } from "@/config/anilist/graph.config";
import type { TranslationKey } from "@/lib/locale/i18n.utils";

import type { TranslationVariables } from "./i18n";

export interface AniRanking {
  rank: number;
  type: string;
  context: string;
}

export interface AniStudio {
  id: number;
  name: string;
}

export interface AniRelatedMedia {
  id: number;
  title: string;
  cover_url: string | null;
  episodes: number | null;
  score: number | null;
  format: string | null;
  media_type: string | null;
}

export interface AniRelation {
  relation_type: string;
  media: AniRelatedMedia;
}

export interface AniMedia {
  id: number;
  title: string;
  titles: string[];
  episodes: number | null;
  duration: number | null;
  format: string | null;
  status: string;
  score: number | null;
  genres: string[];
  tags: string[];
  description: string | null;
  cover_url: string | null;
  banner_image?: string | null;
  id_mal?: number | null;
  trailer_youtube_id?: string | null;
  season: string | null;
  season_year: number | null;
  studios: AniStudio[];
  next_episode: number | null;
  next_airing_at: number | null;
  start_date: string | null;
  end_date: string | null;
  popularity: number | null;
  favourites: number | null;
  rankings: AniRanking[];
  relations: AniRelation[];
}

export interface AniUser {
  id: number;
  name: string;
  avatar: string | null;
  anime_count: number;
  episodes_watched: number;
  mean_score: number | null;
  favourites?: FavouriteAnime[];
}

export interface AniUserProfile extends AniUser {
  banner_image: string | null;
  about: string | null;
  is_following: boolean | null;
  is_follower: boolean | null;
}

export interface AniFriend {
  id: number;
  name: string;
  avatar: string | null;
  added_at: number;
  profile?: AniUserProfile;
  profile_fetched_at?: number;
}

export interface FavouriteAnime {
  id: number;
  title: { romaji: string; english: string | null };
  cover_image: { medium: string | null } | null;
  mean_score: number | null;
  format: string | null;
}

export interface FavouritePerson {
  id: number;
  name: string;
  image: string | null;
}

export interface FavouritePeople {
  staff: FavouritePerson[];
  characters: FavouritePerson[];
}

export interface AniListEntry {
  media: AniMedia;
  progress: number | null;
  score: number | null;
  list_status: string;
  created_at: number | null;
  completed_at: string | null;
  updated_at: number | null;
}

export interface AniListCollection {
  name: string;
  entries: AniListEntry[];
}

export type AniListAnime = {
  animeId: number;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
} | null;

export interface AniRecommendation {
  id: number;
  title: string;
  cover_url: string | null;
  episodes: number | null;
  score: number | null;
  format: string | null;
  recommendation_rating: number;
}

export interface AniCharacterNode {
  id: number;
  name: string;
  native_name: string | null;
  image: string | null;
}

export interface AniVoiceActor {
  id: number;
  name: string;
  native_name: string | null;
  image: string | null;
  language: string | null;
}

export interface AniCharacterEdge {
  role: string;
  character: AniCharacterNode;
  voice_actors: AniVoiceActor[];
}

export interface AniCharacterMediaEdge {
  id: number;
  title: string;
  cover_url: string | null;
}

export interface AniStaffCharacterEdge {
  id: number;
  name: string;
  image: string | null;
}

export interface AniStaffMediaEdge {
  id: number;
  title: string;
  cover_url: string | null;
}

export interface AniAnimeStaffEdge {
  role: string;
  id: number;
  name: string;
}

export interface AniStaffDetail {
  id: number;
  name: string;
  image: string | null;
  characters: AniStaffCharacterEdge[];
  media: AniStaffMediaEdge[];
}

export interface AniActivity {
  id: number;
  created_at: number;
  activity_type: string;
  status: string | null;
  progress: string | null;
  text: string | null;
  media_id: number | null;
  media_title: string | null;
  media_cover: string | null;
  user_id: number;
  user_name: string;
  user_avatar: string | null;
}

export interface AniListSort {
  key: "title" | "score" | "progress";
  dir: "asc" | "desc";
}

export interface AniListFilters {
  tags: string[];
  genres: string[];
  format: string;
  status: string;
  season: string;
  seasonYear: number | null;
  adult: boolean;
  sort: string;
  source: string;
  country: string;
  year: [number, number];
  episodes: [number, number];
  score: [number, number];
}

export interface FranchiseNode {
  id: number;
  title: string;
  cover_url: string | null;
  episodes: number | null;
  score: number | null;
  format: string | null;
  media_type: string | null;
  year: number | null;
}

export interface FranchiseEdge {
  source: number;
  target: number;
  relation_type: string;
}

export interface FranchiseGraph {
  root_id: number;
  nodes: FranchiseNode[];
  edges: FranchiseEdge[];
}

export interface AniListFiltersModalProps {
  open: boolean;
  filters: AniListFilters;
  onApply: (filters: AniListFilters) => void;
  onReset: () => void;
  onClose: () => void;
}

export type RelationFilter = (typeof RELATION_FILTERS)[number];

export interface SimNode {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fy?: number;
  clusterX: number;
}

export interface FranchiseNodePosition {
  x: number;
  y: number;
}

export interface DragState {
  id: number;
  startMouseX: number;
  startMouseY: number;
  startNodeX: number;
  startNodeY: number;
}

export interface FranchiseCamera {
  x: number;
  y: number;
  scale: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  node: FranchiseNode;
}

export interface FranchiseGraphSectionProps {
  animeId: number;
  onRelated?: (id: number) => void;
  expanded?: boolean;
}

export interface GlobalSort {
  key: string;
  dir: "asc" | "desc";
}

export type SearchMode = "tag" | "genre" | "studio" | "season" | null;

export interface AnilistRouteData {
  user: AniUser | null;
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  people: FavouritePeople;
}

export interface AniListFriendsStore {
  friends: AniFriend[];
  addFriend: (friend: Omit<AniFriend, "added_at" | "profile" | "profile_fetched_at">) => void;
  cacheProfile: (profile: AniUserProfile) => void;
  removeFriend: (id: number) => void;
}

export interface AniListObservation {
  signature: string;
  status: string;
  title: string;
  updatedAt: number;
  nextEpisode: number | null;
  nextAiringAt: number | null;
}

export interface AniListNotificationsStore {
  observations: Record<string, AniListObservation>;
  initialized: boolean;
  knownListNames: string[];
  saveObservation: (id: string, observation: AniListObservation) => void;
  setInitialized: (value: boolean) => void;
  setKnownListNames: (names: string[]) => void;
}

export interface FilteredGraph {
  edges: { source: number; target: number; relation_type: string }[];
  ids: Set<number>;
  nodeMap: Map<number, FranchiseNode>;
}

export type ActivityTranslate = (key: TranslationKey, variables?: TranslationVariables) => string;

export interface DayActivityItem {
  id: number;
  title: string;
  cover: string | null;
  progress: number | null;
  events: string;
}

export interface DayActivity {
  added: number;
  progress: number;
  completed: number;
  count: number;
  items: DayActivityItem[];
}

export interface YearGridCell {
  date: Date;
  level: number;
  count: number;
}

export interface CollapsedGraph {
  graph: FilteredGraph;
  aggregators: Map<number, { group: RelationFilter; count: number }>;
}

export type AniListViewState = "loading" | "globalLoading" | "globalEmpty" | "localEmpty" | "login";

export type BrowseTab = "popular" | "trending" | "top";

export interface PrefetchItem {
  id: number;
  title: string;
  relations: string[];
}

export interface PrefetchProgressPayload {
  done: number;
  total: number;
  remaining: number;
  fetched: number;
  skipped: number;
  current: string | null;
  items: PrefetchItem[];
  elapsed_ms: number;
  eta_secs: number | null;
  next_batch_in_ms: number;
}

export interface PrefetchSummary {
  processed: number;
  fetched: number;
  skipped: number;
  cancelled: boolean;
}

export type AniListModalViews = {
  auth: boolean;
  recs: boolean;
  recsLoading: boolean;
  activity: boolean;
  friends: boolean;
  favourites: boolean;
  filters: boolean;
  stats: boolean;
  browse: boolean;
  prefetch: boolean;
};

export interface AniNotificationEntry {
  media: {
    id: number;
    title: string;
    next_episode: number | null;
    next_airing_at: number | null;
    status: string;
  };
  list_status: string;
  listName: string;
}

export interface CameraPoint {
  x: number;
  y: number;
}

export interface CameraTransform {
  scale: number;
  x: number;
  y: number;
}

export interface UseFranchiseViewportOptions {
  initialScale?: number;
  maxScale?: number;
  minScale?: number;
  wheelStep?: number;
}

export interface FranchiseViewport {
  getScale: () => number;
  transformStyle: CSSProperties;
  wrapperProps: {
    onMouseDown: (event: ReactMouseEvent) => void;
    ref: (node: HTMLDivElement | null) => void;
  };
  zoomToElement: (elementId: string, targetScale: number, animationDurationMs?: number) => void;
}

export interface AniCardProps {
  item: AniMedia;
  entryLookup: Map<number, { progress: number | null; score: number | null; list_status: string }>;
  onClick: (anime: AniListAnime) => void;
}

export interface AniListDetailModalHostProps {
  selectedAnime: AniListAnime;
  favouriteIds: Set<number>;
  favouriteStaffIds?: Set<number>;
  favouriteCharacterIds?: Set<number>;
  isLoggedIn: boolean;
  onFavouriteToggle: (animeId: number) => Promise<void>;
  onStaffFavouriteToggle?: (staffId: number) => void;
  onCharacterFavouriteToggle?: (characterId: number) => void;
  onTag: (tag: string) => Promise<void>;
  onGenre: (genre: string) => Promise<void>;
  onStudio: (id: number, name: string) => Promise<void>;
  onSeason: (season: string, seasonYear: number | null) => Promise<void>;
  onRelated: (id: number) => void;
  onBack: (() => void) | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export interface AniDetailProps {
  animeId: number;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
  isLoggedIn: boolean;
  favouriteIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  favouriteCharacterIds?: Set<number>;
  onFavouriteToggle?: (animeId: number) => void;
  onStaffFavouriteToggle?: (staffId: number) => void;
  onCharacterFavouriteToggle?: (characterId: number) => void;
  onTag: (value: string) => void;
  onGenre: (value: string) => void;
  onSeason?: (season: string, year: number | null) => void;
  onStudio?: (id: number, name: string) => void;
  onRelated?: (id: number) => void;
  onBack?: () => void;
  onClose: () => void;
  onSaved?: () => void;
}

export type AniDetailViewProps = AniDetailProps & {
  anime?: AniMedia;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  onTrailer: (youtubeId: string) => void;
};

export interface AniFavouritesProps {
  open: boolean;
  favourites: FavouriteAnime[];
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}

export interface FranchiseGraphProps {
  filtered: FilteredGraph;
  animeId: number;
  containerWidth: number;
  totalHeight: number;
  dims: { w: number; h: number; imgH: number };
  positions: Map<number, FranchiseNodePosition>;
  relationMap: Map<number, string>;
  searchMatchIds: Set<number> | null;
  viewport: FranchiseViewport;
  onNodeClick: (nodeId: number) => void;
  onNodeMouseDown: (event: ReactMouseEvent, nodeId: number) => void;
}

export interface FranchiseListProps {
  nodes: FranchiseNode[];
  animeId: number;
  relationMap: Map<number, string>;
  searchMatchIds: Set<number> | null;
  onNodeClick: (nodeId: number) => void;
}

export type FranchiseCacheSource = "cache" | "fresh" | null;

export interface FranchiseToolbarProps {
  activeFilters: Set<RelationFilter>;
  searchQuery: string;
  cacheSource: FranchiseCacheSource;
  countDiff: string | null;
  listView: boolean;
  onToggleFilter: (filter: RelationFilter) => void;
  onSearchChange: (query: string) => void;
  onToggleView: () => void;
  onResetLayout: () => void;
  onRefresh: () => void;
}

export interface AniFriendsProps {
  friends: AniFriend[];
  onAdd: (profile: AniUserProfile) => void;
  onRemove: (id: number) => void;
  onClose: () => void;
}

export interface AniHeaderProps {
  user: AniUser;
  loadingList: boolean;
  onStatsOpen: () => void;
  onBrowseOpen: () => void;
  onRecsOpen: () => void;
  onPrefetchOpen: () => void;
  onFriendsOpen: () => void;
  onLogout: () => void;
}

export interface AniPrefetchProps {
  animeIds: number[];
  onClose: () => void;
}

export interface AniRecProps {
  open: boolean;
  loading: boolean;
  recommendations: AniRecommendation[];
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}

export interface AniSortProps {
  sort: AniListSort;
  onSortChange: (sort: AniListSort) => void;
  onActivityOpen: () => void;
  onFavouritesOpen: () => void;
  onRandom: () => void;
  hasFavourites: boolean;
}
