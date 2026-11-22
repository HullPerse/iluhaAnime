import { describe, expect, it } from "vitest";

import { StreamApi } from "@/api/stream.api";
import { DEFAULT_STREAM_FILTERS } from "@/config/player/streamFilters.config";
import type { ApiTransport } from "@/types/core/transport";
import { getAnimelibProxyUrl, patchSettings, settingsAtoms } from "@/store/settings.store";

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
        },
      },
    ]);
  });

  it("inherits the AniList proxy when the AnimeLib proxy is empty", async () => {
    patchSettings({
      animelibProxyUrl: null,
      anilistProxyUrl: "socks5h://127.0.0.1:10808",
    });
    const { calls, transport } = fakeTransport(() => EMPTY_SEARCH);
    const api = new StreamApi({ transport, proxyUrl: getAnimelibProxyUrl });

    await api.search("naruto");

    expect(calls[0]?.args).toEqual({
      input: { query: "naruto", page: 1 },
      proxyUrl: "socks5h://127.0.0.1:10808",
    });
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
      },
    });
    expect(calls[1]).toMatchObject({
      command: "anime_lib_stream_sources",
      args: {
        input: { episodeId: "10", variantId: "Kodik:9" },
        proxyUrl: "http://127.0.0.1:7890",
      },
    });
  });

  it("accepts nullable audio titles and rejects malformed playback headers", async () => {
    const source = {
      variantId: "Kodik:9",
      quality: "720",
      label: "720p",
      url: "https://example.com/video.m3u8",
      type: "m3u8",
      headers: { Referer: "https://example.com" },
      subtitles: [],
      audioTracks: [{ id: "audio", language: "ru", title: null, default: true }],
    };
    const { transport } = fakeTransport(() => [source]);
    const valid = new StreamApi({ transport });
    const input = { episodeId: "10", variantId: source.variantId };
    await expect(valid.streamSources(input)).resolves.toEqual([source]);

    const invalid = fakeTransport(() => [{ ...source, headers: { Referer: 42 } }]);
    await expect(
      new StreamApi({ transport: invalid.transport }).streamSources(input)
    ).rejects.toThrow();
  });

  it("routes AllAnime sorting to its own catalog command", async () => {
    const { calls, transport } = fakeTransport(() => EMPTY_SEARCH);
    const api = new StreamApi({ transport });

    await api.search("frieren", 2, DEFAULT_STREAM_FILTERS, "allanime");

    expect(calls).toEqual([
      {
        command: "allanime_search",
        args: { input: { query: "frieren", page: 2, filters: DEFAULT_STREAM_FILTERS } },
      },
    ]);
  });

  it("dispatches every AllAnime catalog and playback command", async () => {
    const { calls, transport } = fakeTransport((command) =>
      command === "allanime_title"
        ? { anime: { id: "allanime:abc", title: "Frieren", slugUrl: "abc" }, episodes: [] }
        : []
    );
    const api = new StreamApi({ transport });

    await api.title("abc", "allanime");
    await api.episodes("allanime:abc", "allanime");
    await api.players("allanime:abc|1", "allanime");
    await api.streamSources(
      { episodeId: "allanime:abc|1", variantId: "AllAnime:sub:x" },
      "allanime"
    );

    expect(calls.map((call) => call.command)).toEqual([
      "allanime_title",
      "allanime_episodes",
      "allanime_players",
      "allanime_stream_sources",
    ]);
  });

  it("keeps the history of each source apart", async () => {
    const { transport } = fakeTransport(() => [
      { animeId: "11", episodeId: "1", slug: "11--a" },
      { animeId: "allanime:abc", episodeId: "allanime:abc|1", slug: "abc" },
    ]);
    const api = new StreamApi({ transport });

    await expect(api.historyRecent(50, "allanime")).resolves.toEqual([
      { animeId: "allanime:abc", episodeId: "allanime:abc|1", slug: "abc" },
    ]);
    await expect(api.historyRecent(50, "animelib")).resolves.toEqual([
      { animeId: "11", episodeId: "1", slug: "11--a" },
    ]);
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

  it("uses a separate proxy for each streaming source", async () => {
    const { calls, transport } = fakeTransport(() => EMPTY_SEARCH);
    const api = new StreamApi({
      transport,
      proxyForSource: (source) =>
        source === "allanime" ? "socks5://127.0.0.1:10808" : "http://127.0.0.1:7890",
    });

    await api.search("frieren", 1, undefined, "allanime");
    await api.search("naruto", 1, undefined, "animelib");

    expect(calls[0]?.args?.proxyUrl).toBe("socks5://127.0.0.1:10808");
    expect(calls[1]?.args?.proxyUrl).toBe("http://127.0.0.1:7890");
  });

  it("tests the connection of the source it belongs to", async () => {
    const { calls, transport } = fakeTransport(() => "titles");
    const api = new StreamApi({ transport });

    await api.testConnection("allanime");
    await api.testConnection("animelib");

    expect(calls.map((call) => call.command)).toEqual([
      "allanime_test_connection",
      "animelib_test_connection",
    ]);
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
      },
    });
  });
});
