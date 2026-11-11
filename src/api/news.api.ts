import { NewsPageSchema } from "@/api/news.schema";
import { tauriTransport } from "@/api/transport.api";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import type { ApiTransport } from "@/types/core/transport";
import type { NewsPage } from "@/types/news/news";

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

  async testConnection(proxyUrl: string | null): Promise<string> {
    const page = await this.feed(1, proxyUrl);
    return `shikimori.io, ${page.items.length} posts`;
  }
}

export const newsApi = new NewsApi();
