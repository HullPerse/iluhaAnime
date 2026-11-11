import { describe, expect, it } from "vitest";

import { NewsApi } from "@/api/news.api";
import type { ApiTransport } from "@/types/core/transport";

function fakeTransport(resolve: (command: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return resolve(command, args) as T;
    },
  };
  return { calls, transport };
}

describe("NewsApi", () => {
  it("resolves an anime through both configured proxies", async () => {
    const { calls, transport } = fakeTransport(() => ({ anilistId: 194213, malId: 61813 }));
    const api = new NewsApi({ transport });

    const link = await api.animeLink(61813, "socks5://127.0.0.1:1080", "http://127.0.0.1:7890");

    expect(link).toEqual({ anilistId: 194213, malId: 61813 });
    expect(calls).toEqual([
      {
        command: "news_anime_link",
        args: {
          shikimoriId: 61813,
          proxyUrl: "socks5://127.0.0.1:1080",
          anilistProxyUrl: "http://127.0.0.1:7890",
        },
      },
    ]);
  });

  it("keeps the link unresolved when the anime has no MyAnimeList entry", async () => {
    const { transport } = fakeTransport(() => null);
    const api = new NewsApi({ transport });

    await expect(api.animeLink(61813, null, null)).resolves.toBeNull();
  });

  it("rejects a malformed link response", async () => {
    const { transport } = fakeTransport(() => ({ anilistId: "194213", malId: 61813 }));
    const api = new NewsApi({ transport });

    await expect(api.animeLink(61813, null, null)).rejects.toThrow();
  });
});
