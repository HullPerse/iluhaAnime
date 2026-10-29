import { tauriTransport } from "@/api/transport.api";
import type { ApiTransport } from "@/api/transport.api";
import { normalizeAnime, normalizeEpisode, normalizeVariant } from "@/lib/stream/helpers";
import { streamProxyArgs } from "@/lib/stream/proxy.utils";
import { settingsAtoms } from "@/store/settings.store";
import type {
  StreamCatalogFilters,
  StreamConstants,
  StreamingEpisode,
  StreamPrefs,
  StreamSearchPage,
  StreamTitle,
  StreamVariant,
} from "@/types/stream";
import type {
  AnimeLibAnime as RawAnime,
  AnimeLibEpisode as RawEpisode,
  AnimeLibVariant as RawVariant,
  StreamSource,
} from "@/types/videoPlayer";

export interface StreamApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null | (() => string | null);
}

interface StreamSourcesInput {
  episodeId: string;
  /** `<player>:<teamId>`, for example `Kodik:32416`. */
  variantId: string;
}

/**
 * AnimeLib catalog client. No credential is required: the API answers search,
 * details, episodes and player rows anonymously. A stored token, when present,
 * is read inside the Rust client and never travels through this layer.
 */
export class StreamApi {
  private readonly transport: ApiTransport;
  private readonly proxyUrl: string | null | (() => string | null);

  constructor(config: StreamApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.proxyUrl = config.proxyUrl ?? null;
  }

  private proxy(): Record<string, string> {
    const resolved = typeof this.proxyUrl === "function" ? this.proxyUrl() : this.proxyUrl;
    return streamProxyArgs(resolved);
  }

  private call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.transport.call<T>(command, { ...args, ...this.proxy() });
  }

  async search(
    query: string,
    page?: number,
    filters?: StreamCatalogFilters
  ): Promise<StreamSearchPage> {
    const raw = await this.call<{
      items: RawAnime[];
      page: number;
      lastPage?: number;
      total?: number;
    }>("anime_lib_search", {
      input: { query, page: page ?? 1, ...(filters ? { filters } : {}) },
    });
    return {
      items: raw.items.map(normalizeAnime),
      page: raw.page,
      lastPage: raw.lastPage,
      total: raw.total,
    };
  }

  /** The type, status, age and genre choices of the catalog filters. */
  async constants(): Promise<StreamConstants> {
    return this.call<StreamConstants>("anime_lib_constants");
  }

  /**
   * A title and its episode list in one round trip. The Rust side asks both
   * endpoints at once, so the list does not wait for the details answer.
   */
  async title(slug: string): Promise<StreamTitle> {
    const raw = await this.call<{ anime: RawAnime; episodes: RawEpisode[] }>("anime_lib_title", {
      input: { slug },
    });
    return {
      anime: normalizeAnime(raw.anime),
      episodes: raw.episodes.map(normalizeEpisode),
    };
  }

  /** The season of a title the player only knows by its numeric media id. */
  async episodes(animeId: string): Promise<StreamingEpisode[]> {
    const raw = await this.call<RawEpisode[]>("anime_lib_episodes", {
      input: { animeId },
    });
    return raw.map(normalizeEpisode);
  }

  async players(episodeId: string): Promise<StreamVariant[]> {
    const raw = await this.call<RawVariant[]>("anime_lib_players", {
      input: { episodeId },
    });
    return raw.map(normalizeVariant);
  }

  /**
   * Resolve a voice-over into every playable source it offers, best first.
   *
   * The list is what the player switches between: a quality change reuses it,
   * so it never touches the source page again.
   */
  async streamSources(input: StreamSourcesInput): Promise<StreamSource[]> {
    return this.call<StreamSource[]>("anime_lib_stream_sources", { input });
  }

  /** Whether an AnimeLib session token is stored in the OS credential store. */
  async tokenStatus(): Promise<boolean> {
    return this.transport.call<boolean>("animelib_token_status");
  }

  /** Validate the token against `/auth/me` and store it in the keyring. */
  async tokenSave(token: string): Promise<void> {
    await this.call<null>("animelib_token_save", { token: token.trim() });
  }

  async tokenClear(): Promise<void> {
    await this.transport.call<null>("animelib_token_clear");
  }

  /** The remembered voice-over, quality and languages of a title. */
  async prefsGet(sourceId: string, mediaId: string): Promise<StreamPrefs | null> {
    return this.transport.call<StreamPrefs | null>("stream_prefs_get", {
      sourceId,
      mediaId,
    });
  }

  /** Remember the choice for the next episode and the next launch. */
  async prefsSave(prefs: StreamPrefs): Promise<void> {
    await this.transport.call<null>("stream_prefs_save", { prefs });
  }
}

export const streamApi = new StreamApi({
  proxyUrl: () => settingsAtoms.animelibProxyUrl.get(),
});
