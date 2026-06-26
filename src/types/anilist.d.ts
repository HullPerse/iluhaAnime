export interface AniRanking {
  rank: number;
  type_: string;
  context: string;
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
  studios: string[];
  next_episode: number | null;
  next_airing_at: number | null;
  start_date: string | null;
  end_date: string | null;
  popularity: number | null;
  favourites: number | null;
  rankings: AniRanking[];
}

export interface AniUser {
  id: number;
  name: string;
  avatar: string | null;
  anime_count: number;
  episodes_watched: number;
  mean_score: number | null;
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

export type AniListSort = {
  key: "title" | "score" | "progress";
  dir: "asc" | "desc";
};
