export interface StreamingAnime {
  id: string;
  title: string;
  synonyms: string[];
  cover?: string;
  banner?: string;
  description?: string;
  year?: number;
  status?: string;
  genres: string[];
  episodeCount?: number;
  rating?: number;
  ratingVotes?: number;
  mediaType?: string;
  ageRating?: string;
  views?: number;
  anilistId?: number;
  subOrDub?: string;
  slugUrl: string;
}

export interface StreamingEpisode {
  id: string;
  number: number;
  title?: string;
  airDate?: string;
  duration?: number;
  cover?: string;
}

export interface StreamTitle {
  anime: StreamingAnime;
  episodes: StreamingEpisode[];
}

export type StreamQuality = "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p";

export interface StreamVariant {
  id: string;
  name: string;
  language?: string;
  separateStream: boolean;
  player: string;
  sourceUrl: string;
}

export interface StreamPrefs {
  sourceId: string;
  mediaId: string;
  variantId: string;
  quality: string;
  audioLang: string;
  subLang: string;
  subEnabled: boolean;
  updatedAt?: number;
}

export interface StreamSearchPage {
  items: StreamingAnime[];
  page: number;
  lastPage?: number;
  total?: number;
}

export interface StreamFilterOption {
  id: number;
  label: string;
}

export interface StreamGenreOption {
  id: number;
  label: string;
  adult: boolean;
}

export interface StreamCatalogFilters {
  types: number[];
  genres: number[];
  statuses: number[];
  ageRatings: number[];
  yearMin: number | null;
  yearMax: number | null;
  episodesMin: number | null;
  episodesMax: number | null;
  sortBy: StreamSortBy;
  sortType: "asc" | "desc";
  adult: boolean;
}

export type StreamSortBy = "rating_score" | "views" | "name" | "created_at";

export interface StreamHistoryEntry {
  animeId: string;
  episodeId: string;
  slug: string;
  title: string;
  cover?: string;
  anilistId?: number;
  episodeNumber: number;
  episodeTitle?: string;
  episodeCover?: string;
  position: number;
  duration: number;
  updatedAt: number;
}

export interface StreamHistoryProgress {
  animeId: string;
  slug: string;
  title: string;
  cover?: string;
  anilistId?: number;
  watched: number;
  lastEpisode: number;
  lastPosition: number;
  lastDuration: number;
  updatedAt: number;
}

export interface StreamConstants {
  types: StreamFilterOption[];
  statuses: StreamFilterOption[];
  ageRatings: StreamFilterOption[];
  genres: StreamGenreOption[];
}
