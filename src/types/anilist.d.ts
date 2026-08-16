export interface AniRanking {
  rank: number;
  type_: string;
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
  /** Cached profile data to avoid repeating the same AniList request. */
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

export interface Props {
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
}

export interface AniListFriendsStore {
  friends: AniFriend[];
  addFriend: (
    friend: Omit<AniFriend, "added_at" | "profile" | "profile_fetched_at">
  ) => void;
  cacheProfile: (profile: AniUserProfile) => void;
  removeFriend: (id: number) => void;
}

export interface AniListObservation {
  signature: string;
  status: string;
  title: string;
  updatedAt: number;
}

export interface AniListNotificationsStore {
  observations: Record<string, AniListObservation>;
  initialized: boolean;
  saveObservation: (id: string, observation: AniListObservation) => void;
  setInitialized: (value: boolean) => void;
}

export interface FilteredGraph {
  edges: { source: number; target: number; relation_type: string }[];
  ids: Set<number>;
  nodeMap: Map<number, FranchiseNode>;
}
