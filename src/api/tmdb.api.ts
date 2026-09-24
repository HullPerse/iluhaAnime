import { useSettingsStore } from "@/store/settings.store";
import type { TmdbRateLimit } from "@/types/collection";

import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

export interface TmdbApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null;
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

export class TmdbApi {
  private readonly transport: ApiTransport;
  private readonly proxyUrl: string | null;

  constructor(config: TmdbApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.proxyUrl = config.proxyUrl ?? null;
  }

  isConfigured(): boolean {
    return useSettingsStore.getState().tmdbKeySet;
  }

  private proxy(): string | undefined {
    return this.proxyUrl ?? useSettingsStore.getState().tmdbProxyUrl ?? undefined;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return this.transport.call<T>(command, args);
  }

  search<T>(params: TmdbSearchParams): Promise<T[]> {
    return this.call("search_tmdb", {
      apiKey: "",
      ...params,
      proxyUrl: this.proxy(),
    });
  }

  getDetails<T = TmdbDetails>(tmdbId: number, mediaType: string): Promise<T> {
    return this.call("get_tmdb_details", {
      apiKey: "",
      tmdbId,
      mediaType,
      proxyUrl: this.proxy(),
    });
  }

  getMedia<T = TmdbMediaParts>(tmdbId: number, mediaType: string): Promise<T> {
    return this.call("get_tmdb_media", {
      apiKey: "",
      tmdbId,
      mediaType,
      proxyUrl: this.proxy(),
    });
  }

  rateLimit(): Promise<TmdbRateLimit> {
    return this.call("get_tmdb_rate_limit");
  }

  setApiKey(apiKey: string): Promise<string> {
    return this.call("tmdb_set_api_key", { apiKey });
  }

  logout(): Promise<string> {
    return this.call("tmdb_logout");
  }

  testConnection(): Promise<string> {
    const proxy = this.proxy();
    return this.call("test_tmdb_connection", { proxyUrl: proxy, proxy_url: proxy });
  }
}

export const tmdbApi = new TmdbApi();
