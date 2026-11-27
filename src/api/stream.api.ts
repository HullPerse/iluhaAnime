import { translate } from "@/lib/locale/i18n.utils";
import { tauriTransport } from "@/api/transport.api";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import { StreamSourcesSchema } from "@/schemas/stream.schema";
import { noteNetworkFailure, noteNetworkSuccess } from "@/lib/core/system/networkHealth.utils";
import type { ApiTransport } from "@/types/core/transport";
import {
  normalizeAnime,
  normalizeEpisode,
  normalizeVariant,
} from "@/lib/player/streamHelpers.utils";
import { DEFAULT_STREAM_SOURCE, streamSourceConfig } from "@/config/player/streamSources.config";
import { streamProxyArgs } from "@/lib/player/streamProxy.utils";
import { getStreamProxyUrl } from "@/store/settings.store";
import { attempt } from "@hullperse/hp_utils/attempt";
import type {
  StreamCatalogFilters,
  StreamConstants,
  StreamingEpisode,
  StreamHistoryEntry,
  StreamHistoryProgress,
  StreamPrefs,
  StreamSearchPage,
  StreamSourceId,
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

import type { AnimeLibAccount, StreamApiConfig, StreamSourcesInput } from "@/types/api/stream";

export class StreamApi {
  private readonly transport: ApiTransport;

  private readonly proxyUrl: string | null | (() => string | null);

  private readonly proxyForSource: ((source: StreamSourceId) => string | null) | null;

  constructor(config: StreamApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.proxyUrl = config.proxyUrl ?? null;
    this.proxyForSource = config.proxyForSource ?? null;
  }

  private proxy(source: StreamSourceId = DEFAULT_STREAM_SOURCE): Record<string, string> {
    const resolved =
      this.proxyForSource?.(source) ??
      (typeof this.proxyUrl === "function" ? this.proxyUrl() : this.proxyUrl);

    return streamProxyArgs(resolved);
  }

  private command(
    kind: "search" | "title" | "episodes" | "players" | "stream_sources" | "test_connection",
    source: StreamSourceId
  ): string {
    if (source === "animelib" && kind === "test_connection") return "animelib_test_connection";

    return source === "allanime" ? `allanime_${kind}` : `anime_lib_${kind}`;
  }

  private async call<T>(
    command: string,
    args: Record<string, unknown> = {},
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<T> {
    const [value, error] = await attempt(
      this.transport.call<T>(command, { ...args, ...this.proxy(source) })
    );

    if (error !== null) {
      noteNetworkFailure(error);

      if (error.message.includes("NEED_CAPTCHA")) {
        throw new Error(translate("stream.error.captcha"));
      }

      throw error;
    }

    noteNetworkSuccess();

    return value;
  }

  async search(
    query: string,
    page?: number,
    filters?: StreamCatalogFilters,
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<StreamSearchPage> {
    const filterArgs = filters ? { filters } : {};
    const raw = await this.call<{
      items: RawAnime[];
      page: number;
      lastPage?: number;
      total?: number;
    }>(
      this.command("search", source),
      { input: { query, page: page ?? 1, ...filterArgs } },
      source
    );

    return {
      items: raw.items.map(normalizeAnime),
      page: raw.page,
      lastPage: raw.lastPage,
      total: raw.total,
    };
  }

  async random(
    filters: StreamCatalogFilters,
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<StreamingAnime | null> {
    if (!streamSourceConfig(source).supportsRandom) return null;
    const raw = await this.call<RawAnime | null>("anime_lib_random", { filters }, source);

    return raw ? normalizeAnime(raw) : null;
  }

  async constants(source: StreamSourceId = DEFAULT_STREAM_SOURCE): Promise<StreamConstants> {
    if (!streamSourceConfig(source).supportsFilters) {
      return { types: [], statuses: [], ageRatings: [], genres: [] };
    }

    return this.call<StreamConstants>("anime_lib_constants", {}, source);
  }

  async title(slug: string, source: StreamSourceId = DEFAULT_STREAM_SOURCE): Promise<StreamTitle> {
    const raw = await this.call<{ anime: RawAnime; episodes: RawEpisode[] }>(
      this.command("title", source),
      { input: { slug } },
      source
    );

    return {
      anime: normalizeAnime(raw.anime),
      episodes: raw.episodes.map(normalizeEpisode),
    };
  }

  async episodes(
    animeId: string,
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<StreamingEpisode[]> {
    const raw = await this.call<RawEpisode[]>(
      this.command("episodes", source),
      { input: { animeId } },
      source
    );

    return raw.map(normalizeEpisode);
  }

  async players(
    episodeId: string,
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<StreamVariant[]> {
    const raw = await this.call<RawVariant[]>(
      this.command("players", source),
      { input: { episodeId } },
      source
    );

    return raw.map(normalizeVariant);
  }

  async streamSources(
    input: StreamSourcesInput,
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<StreamSource[]> {
    const sources = await this.call<unknown>(
      this.command("stream_sources", source),
      { input },
      source
    );

    return assertSchema(sources, StreamSourcesSchema);
  }

  /**
   * Warm the route to a resolved media URL: DNS, TLS and the CDN edge, capped
   * at 64 KiB by Rust. The transport call is explicit because the catalog proxy
   * is not always the route the media plays through.
   */
  async warm(url: string, headers: Record<string, string>, proxyUrl: string | null): Promise<void> {
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

  async testConnection(source: StreamSourceId = DEFAULT_STREAM_SOURCE): Promise<string> {
    return this.call<string>(this.command("test_connection", source), {}, source);
  }

  async prefsGet(sourceId: string, mediaId: string): Promise<StreamPrefs | null> {
    return this.transport.call<StreamPrefs | null>("stream_prefs_get", {
      sourceId,
      mediaId,
    });
  }

  async prefsSave(prefs: StreamPrefs, fields?: string[]): Promise<void> {
    await this.transport.call<null>("stream_prefs_save", {
      prefs,
      ...(fields === undefined ? {} : { fields }),
    });
  }

  async historyRecent(
    limit = 50,
    source: StreamSourceId = DEFAULT_STREAM_SOURCE
  ): Promise<StreamHistoryEntry[]> {
    const rows = await this.transport.call<StreamHistoryEntry[]>("stream_history_recent", {
      limit,
    });
    const prefix = streamSourceConfig(source).mediaPrefix;

    return rows.filter((row) =>
      prefix === "" ? !row.animeId.startsWith("allanime:") : row.animeId.startsWith(prefix)
    );
  }

  async historyForAnime(animeId: string): Promise<StreamHistoryEntry[]> {
    return this.transport.call<StreamHistoryEntry[]>("stream_history_for_anime", { animeId });
  }

  async historyProgress(animeId: string): Promise<StreamHistoryProgress | null> {
    return this.transport.call<StreamHistoryProgress | null>("stream_history_progress", {
      animeId,
    });
  }

  async historyProgressMany(
    animeIds: string[]
  ): Promise<Record<string, StreamHistoryProgress | null>> {
    return this.transport.call<Record<string, StreamHistoryProgress | null>>(
      "stream_history_progress_many",
      { animeIds }
    );
  }

  async historyClear(): Promise<void> {
    await this.transport.call<null>("stream_history_clear");
  }
}

export const streamApi = new StreamApi({
  proxyForSource: getStreamProxyUrl,
});
