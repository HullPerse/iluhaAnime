import { tauriTransport } from "@/api/transport.api";
import { noteNetworkFailure, noteNetworkSuccess } from "@/lib/core/system/networkHealth.utils";
import type { ApiTransport } from "@/types/core/transport";
import {
  normalizeAnime,
  normalizeEpisode,
  normalizeVariant,
} from "@/lib/player/streamHelpers.utils";
import { streamProxyArgs } from "@/lib/player/streamProxy.utils";
import { settingsAtoms } from "@/store/settings.store";
import type {
  StreamCatalogFilters,
  StreamConstants,
  StreamingEpisode,
  StreamHistoryEntry,
  StreamHistoryProgress,
  StreamPrefs,
  StreamSearchPage,
  StreamTitle,
  StreamVariant,
  StreamingAnime,
} from "@/types/player/stream";
import type {
  AnimeLibAnime as RawAnime,
  AnimeLibEpisode as RawEpisode,
  AnimeLibVariant as RawVariant,
  StreamSource,
} from "@/types/player/videoPlayer";

import type { AnimeLibAccount, StreamApiConfig } from "@/types/api/stream";

interface StreamSourcesInput {
  episodeId: string;
  variantId: string;
}

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

  private async call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    try {
      const value = await this.transport.call<T>(command, { ...args, ...this.proxy() });
      noteNetworkSuccess();
      return value;
    } catch (error) {
      noteNetworkFailure(error);
      throw error;
    }
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

  async random(filters: StreamCatalogFilters): Promise<StreamingAnime | null> {
    const raw = await this.call<RawAnime | null>("anime_lib_random", { filters });
    return raw ? normalizeAnime(raw) : null;
  }

  async constants(): Promise<StreamConstants> {
    return this.call<StreamConstants>("anime_lib_constants");
  }

  async title(slug: string): Promise<StreamTitle> {
    const raw = await this.call<{ anime: RawAnime; episodes: RawEpisode[] }>("anime_lib_title", {
      input: { slug },
    });
    return {
      anime: normalizeAnime(raw.anime),
      episodes: raw.episodes.map(normalizeEpisode),
    };
  }

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

  async streamSources(input: StreamSourcesInput): Promise<StreamSource[]> {
    return this.call<StreamSource[]>("anime_lib_stream_sources", { input });
  }

  /**
   * Warm the route to a resolved media URL: DNS, TLS and the CDN edge, capped
   * at 64 KiB by Rust. The transport call is explicit because the catalog proxy
   * is not always the route the media plays through.
   */
  async warm(
    url: string,
    headers: Record<string, string>,
    proxyUrl: string | null
  ): Promise<void> {
    await this.transport.call<null>("stream_warm", {
      url,
      headers,
      proxyUrl: proxyUrl ?? null,
    });
  }

  async webviewLogin(): Promise<string> {
    return this.call<string>("animelib_webview_login");
  }

  async finishWebviewLogin(): Promise<string> {
    return this.call<string>("animelib_finish_webview_login");
  }

  async account(): Promise<AnimeLibAccount> {
    return this.call<AnimeLibAccount>("animelib_account");
  }

  async tokenSave(token: string): Promise<void> {
    await this.call<null>("animelib_token_save", { token: token.trim() });
  }

  async tokenClear(): Promise<void> {
    await this.transport.call<null>("animelib_token_clear");
  }

  async testConnection(): Promise<string> {
    return this.call<string>("animelib_test_connection");
  }

  async prefsGet(sourceId: string, mediaId: string): Promise<StreamPrefs | null> {
    return this.transport.call<StreamPrefs | null>("stream_prefs_get", {
      sourceId,
      mediaId,
    });
  }

  async prefsSave(prefs: StreamPrefs): Promise<void> {
    await this.transport.call<null>("stream_prefs_save", { prefs });
  }

  async historyRecent(limit = 50): Promise<StreamHistoryEntry[]> {
    return this.transport.call<StreamHistoryEntry[]>("stream_history_recent", { limit });
  }

  async historyForAnime(animeId: string): Promise<StreamHistoryEntry[]> {
    return this.transport.call<StreamHistoryEntry[]>("stream_history_for_anime", { animeId });
  }

  async historyProgress(animeId: string): Promise<StreamHistoryProgress | null> {
    return this.transport.call<StreamHistoryProgress | null>("stream_history_progress", {
      animeId,
    });
  }

  async historyClear(): Promise<void> {
    await this.transport.call<null>("stream_history_clear");
  }
}

export const streamApi = new StreamApi({
  proxyUrl: () => settingsAtoms.animelibProxyUrl.get(),
});
