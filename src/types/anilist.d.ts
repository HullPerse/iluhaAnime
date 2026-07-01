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

export interface AniCharacterEdge {
  role: string;
  character: AniCharacterNode;
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

export type AniListSort = {
  key: "title" | "score" | "progress";
  dir: "asc" | "desc";
};
