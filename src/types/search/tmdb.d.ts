import type { ApiTransport } from "./transport.api";

export interface TmdbApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null | (() => string | null);
  isConfigured?: () => boolean;
}

export interface TmdbSearchParams {
  query?: string | null;
  language?: string;
  includeAdult?: boolean;
  perPage?: number;
  maxPages?: number;
}

export interface TmdbDetails {
  title: string;
  overview: string | null;
  year: number | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  posters: { url: string }[];
}

export interface TmdbMediaParts {
  backdrops: { url: string }[];
  trailerYoutubeId: string | null;
}
