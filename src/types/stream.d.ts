// Streaming domain types for AnimeLib integration.
// These are normalized, source-agnostic types used by the streaming UI and
// playback layer. Provider-specific shapes live in the Rust layer.

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
  /** The site's average score, 0..10, from the list answer itself. */
  rating?: number;
  /** How many viewers scored the title. */
  ratingVotes?: number;
  /** The site's media type label, for example `TV Сериал` or `Фильм`. */
  mediaType?: string;
  /** The site's age rating label, for example `PG-13`. */
  ageRating?: string;
  /** Total views; only the details answer serves it. */
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

/** A title and its episode list, answered by one catalog command. */
export interface StreamTitle {
  anime: StreamingAnime;
  episodes: StreamingEpisode[];
}

/** The quality rows the stream settings select offers. */
export type StreamQuality = "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p";

export interface StreamVariant {
  id: string;
  name: string;
  language?: string;
  separateStream: boolean;
  /** The hoster name, for example `Kodik`. */
  player: string;
  /** The hoster's own player URL; empty when the site serves the row itself. */
  sourceUrl: string;
}

export interface StreamVideoSource {
  variantId: string;
  quality: string;
  label: string;
  url: string;
  type: string;
  headers: Record<string, string>;
  subtitles: SubtitleTrack[];
  audioTracks: AudioTrack[];
}

export interface SubtitleTrack {
  id: string;
  url: string;
  language: string;
  isDefault: boolean;
  headers: Record<string, string>;
}

export interface AudioTrack {
  id: string;
  language: string;
  title?: string;
  default: boolean;
}

export interface StreamPrefs {
  sourceId: string;
  mediaId: string;
  /** `<player>:<teamId>`, stable between episodes. */
  variantId: string;
  /** Quality label; an empty string means "best available". */
  quality: string;
  /** Language code or track title of the chosen audio track. */
  audioLang: string;
  /** Language code or track title of the chosen subtitle track. */
  subLang: string;
  subEnabled: boolean;
  updatedAt?: number;
}

export interface StreamSearchPage {
  items: StreamingAnime[];
  /** The page the API actually answered with. */
  page: number;
  /** Present when the API sends its pagination envelope. */
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

/**
 * The AnimeLib catalog filters, mirroring the site's own `mediaFilter` model.
 * `adult` is a permission, not a filter: it reveals the 18+ age rating and the
 * adult genres whose ids the shopping list hides otherwise.
 */
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

/** The catalog filter options, already narrowed to the AnimeLib site. */
export interface StreamConstants {
  types: StreamFilterOption[];
  statuses: StreamFilterOption[];
  ageRatings: StreamFilterOption[];
  genres: StreamGenreOption[];
}

export interface StreamSearchParams {
  query: string;
  page?: number;
  filters?: StreamCatalogFilters;
}
