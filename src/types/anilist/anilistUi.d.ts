import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import type { EntryLookup } from "@/types/anilist/entries";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type {
  AniCharacterEdge,
  AniFriend,
  AniFriendMinimal,
  AniListAnime,
  AniListCollection,
  AniListSort,
  AniMedia,
  AniRecommendation,
  AniUser,
  AniUserProfile,
  AniVoiceActor,
  FavouriteAnime,
  FavouritePeople,
  FilteredGraph,
  FranchiseEdge,
  FranchiseNode,
  FranchiseNodePosition,
  RelationFilter,
} from "./anilist";

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
  entryLookup: EntryLookup;
  isFavorite: boolean;
  scoreFormat?: AnilistScoreFormat | null;
  onClick: (anime: AniListAnime) => void;
}

export interface AniListDetailModalHostProps {
  selectedAnime: AniListAnime;
  entryLookup?: EntryLookup;
  scoreFormat?: AnilistScoreFormat | null;
  favouriteIds: Set<number>;
  favouriteStaffIds?: Set<number>;
  favouriteCharacterIds?: Set<number>;
  isLoggedIn: boolean;
  onFavouriteToggle: (animeId: number) => Promise<void>;
  onStaffFavouriteToggle?: (staffId: number) => void;
  onCharacterFavouriteToggle?: (characterId: number) => void;
  onTag: (tag: string) => void;
  onGenre: (genre: string) => void;
  onStudio: (id: number, name: string) => void;
  onSeason: (season: string, seasonYear: number | null) => void;
  onRelated: (id: number) => void;
  onBack: (() => void) | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export interface AniDetailProps {
  animeId: number;
  entryLookup?: EntryLookup;
  scoreFormat?: AnilistScoreFormat | null;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
    notes: string | null;
    custom_lists: string[];
  };
  isLoggedIn: boolean;
  favouriteIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  favouriteCharacterIds?: Set<number>;
  onFavouriteToggle?: (animeId: number) => Promise<void> | void;
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
  initialCharacters?: AniCharacterEdge[];
  initialRecommendations?: AniRecommendation[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  onTrailer: (youtubeId: string) => void;
  onPushScreen: (screen: AniListOverlayScreen) => void;
};

export type AniListOverlayScreen =
  | { kind: "character"; id: number; name: string; role?: string; voiceActors: AniVoiceActor[] }
  | { kind: "staff"; id: number; name: string }
  | { kind: "anime"; id: number; name: string };

export interface AniListOverlayContext {
  isLoggedIn: boolean;
  favouriteCharacterIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  onCharacterFavouriteToggle?: (id: number) => void;
  onStaffFavouriteToggle?: (id: number) => void;
  onOpenAnime: (id: number) => void;
  onPush: (screen: AniListOverlayScreen) => void;
}

export type FavouritesTab = "anime" | "characters" | "staff";

export interface AniFavouritesProps {
  open: boolean;
  favourites: FavouriteAnime[];
  people: FavouritePeople;
  isLoggedIn: boolean;
  favouriteCharacterIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  onCharacterFavouriteToggle?: (id: number) => void;
  onStaffFavouriteToggle?: (id: number) => void;
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
  edges: FranchiseEdge[];
  animeId: number;
  entryLookup?: EntryLookup;
  relationMap: Map<number, string>;
  mainlineIds: Set<number>;
  searchMatchIds: Set<number> | null;
  scoreFormat?: AnilistScoreFormat | null;
  onNodeClick: (nodeId: number) => void;
}

export interface FranchiseToolbarProps {
  activeFilters: Set<RelationFilter>;
  groupCounts: Record<RelationFilter, number>;
  searchQuery: string;
  matchCount: number | null;
  listView: boolean;
  refreshing: boolean;
  onToggleFilter: (filter: RelationFilter) => void;
  onSearchChange: (query: string) => void;
  onToggleView: () => void;
  onFocusCurrent: () => void;
  onResetLayout: () => void;
  onRefresh: () => void;
}

export interface AniFriendsProps {
  friends: AniFriend[];
  selfUser: AniUser | null;
  selfLists: AniListCollection[];
  selfFavourites: FavouriteAnime[];
  onAdd: (profile: AniUserProfile) => void;
  onAddMany: (friends: AniFriendMinimal[]) => void;
  onRemove: (id: number) => void;
  onViewLists: (friend: AniFriend) => void;
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
  watchedIds: Set<number>;
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}

export interface AniSortProps {
  sort: AniListSort;
  onSortChange: (sort: AniListSort) => void;
  onActivityOpen: () => void;
  onFavouritesOpen: () => void;
  onRandom: () => void;
  onSpotlight: () => void;
  hasFavourites: boolean;
  groupByStatus: boolean;
  onGroupChange: (grouped: boolean) => void;
  displayMode: "scroll" | "pagination";
  onDisplayChange: (mode: "scroll" | "pagination") => void;
  showActions?: boolean;
}


export type SpotlightKind = "day" | "week" | "month";

export interface FriendScore {
  id: number;
  name: string;
  avatar: string | null;
  score: number | null;
  scoreFormat: AnilistScoreFormat | null;
  status: string;
  comment: string | null;
  repeat: number | null;
  progress: number | null;
  episodes: number | null;
}

export interface AniFriendScore {
  userId: number;
  score: number | null;
  scoreFormat: string | null;
  status: string | null;
  progress: number | null;
  repeat: number | null;
  notes: string | null;
  episodes: number | null;
}

export interface PrefetchSnapshot {
  ids: number[];
  done: number;
  total: number;
}

export type AniListScrollRow = { kind: "header"; name: string } | { kind: "item"; media: AniMedia };

export type SpotlightRowState =
  | { status: "loading" }
  | { status: "ready"; media: AniMedia }
  | { status: "error" };

export type FriendView = "profile" | "compare";
