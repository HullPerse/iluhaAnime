import { describe, expect, it } from "vitest";

import { StreamApi } from "@/api/stream.api";
import type { ApiTransport } from "@/types/core/transport";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

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

const EMPTY_SEARCH = { items: [], page: 1 };

describe("StreamApi", () => {
  it("injects the configured proxy into catalog requests", async () => {
    patchSettings({ animelibProxyUrl: "socks5://127.0.0.1:10808" });
    const { calls, transport } = fakeTransport(() => EMPTY_SEARCH);
    const api = new StreamApi({
      transport,
      proxyUrl: () => settingsAtoms.animelibProxyUrl.get(),
    });

    await api.search("naruto", 2);

    expect(calls).toEqual([
      {
        command: "anime_lib_search",
        args: {
          input: { query: "naruto", page: 2 },
          proxyUrl: "socks5://127.0.0.1:10808",
          proxy_url: "socks5://127.0.0.1:10808",
        },
      },
    ]);
  });

  it("sends no proxy keys for a direct connection", async () => {
    patchSettings({ animelibProxyUrl: null });
    const { calls, transport } = fakeTransport(() => EMPTY_SEARCH);
    const api = new StreamApi({
      transport,
      proxyUrl: () => settingsAtoms.animelibProxyUrl.get(),
    });

    await api.search("naruto");

    expect(calls[0]?.args).toEqual({ input: { query: "naruto", page: 1 } });
  });

  it("sends the proxy with the filter constants and playback sources", async () => {
    patchSettings({ animelibProxyUrl: "http://127.0.0.1:7890" });
    const { calls, transport } = fakeTransport((command) =>
      command === "anime_lib_constants"
        ? { types: [], statuses: [], ageRatings: [], genres: [] }
        : []
    );
    const api = new StreamApi({
      transport,
      proxyUrl: () => settingsAtoms.animelibProxyUrl.get(),
    });

    await api.constants();
    await api.streamSources({ episodeId: "10", variantId: "Kodik:9" });

    expect(calls[0]).toMatchObject({
      command: "anime_lib_constants",
      args: {
        proxyUrl: "http://127.0.0.1:7890",
        proxy_url: "http://127.0.0.1:7890",
      },
    });
    expect(calls[1]).toMatchObject({
      command: "anime_lib_stream_sources",
      args: {
        input: { episodeId: "10", variantId: "Kodik:9" },
        proxyUrl: "http://127.0.0.1:7890",
        proxy_url: "http://127.0.0.1:7890",
      },
    });
  });

  it("asks for a title and its episodes in one command", async () => {
    const { calls, transport } = fakeTransport(() => ({
      anime: { id: "11", title: "Naruto", slugUrl: "11--naruto-anime" },
      episodes: [{ id: "1", number: 1, title: "Pilot" }],
    }));
    const api = new StreamApi({ transport, proxyUrl: () => null });

    const result = await api.title("11--naruto-anime");

    expect(calls).toEqual([
      { command: "anime_lib_title", args: { input: { slug: "11--naruto-anime" } } },
    ]);
    expect(result.anime).toMatchObject({ id: "11", title: "Naruto", genres: [] });
    expect(result.episodes).toEqual([{ id: "1", number: 1, title: "Pilot" }]);
  });

  it("uses the proxy for the session check when saving a token", async () => {
    patchSettings({ animelibProxyUrl: "socks5h://127.0.0.1:10808" });
    const { calls, transport } = fakeTransport(() => null);
    const api = new StreamApi({
      transport,
      proxyUrl: () => settingsAtoms.animelibProxyUrl.get(),
    });

    await api.tokenSave("  token.value  ");

    expect(calls[0]).toEqual({
      command: "animelib_token_save",
      args: {
        token: "token.value",
        proxyUrl: "socks5h://127.0.0.1:10808",
        proxy_url: "socks5h://127.0.0.1:10808",
      },
    });
  });
});
