import { beforeEach, describe, expect, it } from "vitest";

import { TorrentApi, torrentApi } from "@/api/torrent.api";
import type { ApiTransport } from "@/api/transport.api";
import { useSettingsStore } from "@/store/settings.store";

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

beforeEach(() => {
  useSettingsStore.setState({ searchProxyUrls: {} });
});

describe("TorrentApi", () => {
  it("resolves the proxy per source", () => {
    useSettingsStore.setState({ searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" } });
    const api = new TorrentApi();
    expect(api.proxyFor("rutracker")).toBe("socks5://127.0.0.1:10808");
    expect(api.proxyFor("nyaa")).toBeUndefined();
  });

  it("prefers constructor proxies over the store", () => {
    const api = new TorrentApi({ proxies: { nyaa: "http://127.0.0.1:7890" } });
    expect(api.proxyFor("nyaa")).toBe("http://127.0.0.1:7890");
  });

  it("routes source searches with the source proxy", async () => {
    useSettingsStore.setState({ searchProxyUrls: { nyaa: "http://127.0.0.1:7890" } });
    const { calls, transport } = fakeTransport(() => []);
    const api = new TorrentApi({ transport });

    await api.searchBySource("nyaa", { query: "frieren", page: 2, sort: "seeders", order: "desc" });
    await api.searchBySource("rutracker", { query: "frieren" });

    expect(calls[0]).toEqual({
      command: "search_nyaa",
      args: {
        query: "frieren",
        page: 2,
        sort: "seeders",
        order: "desc",
        proxyUrl: "http://127.0.0.1:7890",
        proxy_url: "http://127.0.0.1:7890",
      },
    });
    expect(calls[1]).toEqual({
      command: "search_rutracker",
      args: { query: "frieren", proxyUrl: undefined, proxy_url: undefined },
    });
  });

  it("trims login credentials", async () => {
    const { calls, transport } = fakeTransport(() => "ok");
    const api = new TorrentApi({ transport });

    await api.rutrackerLogin("  user  ", "pass");
    await api.nekobtSetApiKey("  key  ");

    expect(calls[0]?.args).toMatchObject({ username: "user", password: "pass" });
    expect(calls[1]?.args).toMatchObject({ apiKey: "key" });
  });

  it("exposes the shared singleton", () => {
    expect(torrentApi).toBeInstanceOf(TorrentApi);
  });
});
