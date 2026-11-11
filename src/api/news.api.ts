import { NewsAnimeLinkSchemaCompiled, NewsPageSchema } from "@/api/news.schema";
import { tauriTransport } from "@/api/transport.api";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import type { ApiTransport } from "@/types/core/transport";
import type { NewsAnimeLink, NewsPage } from "@/types/news/news";

interface NewsApiConfig {
  transport?: ApiTransport;
}

export class NewsApi {
  private readonly transport: ApiTransport;

  constructor(config: NewsApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  async feed(page: number, proxyUrl: string | null): Promise<NewsPage> {
    const args: Record<string, unknown> = { page };
    if (proxyUrl) args.proxyUrl = proxyUrl;
    const raw = await this.transport.call<unknown>("news_feed", args);
    return assertSchema(raw, NewsPageSchema);
  }

  /** Resolves the post's Shikimori anime to AniList through its MyAnimeList link. */
  async animeLink(
    shikimoriId: number,
    proxyUrl: string | null,
    anilistProxyUrl: string | null
  ): Promise<NewsAnimeLink | null> {
    const args: Record<string, unknown> = { shikimoriId };
    if (proxyUrl) args.proxyUrl = proxyUrl;
    if (anilistProxyUrl) args.anilistProxyUrl = anilistProxyUrl;
    const raw = await this.transport.call<unknown>("news_anime_link", args);
    if (raw === null) return null;
    return assertSchema(raw, NewsAnimeLinkSchemaCompiled);
  }

  async testConnection(proxyUrl: string | null): Promise<string> {
    const page = await this.feed(1, proxyUrl);
    return `shikimori.io, ${page.items.length} posts`;
  }
}

export const newsApi = new NewsApi();
