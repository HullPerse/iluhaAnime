import { beforeEach, describe, expect, it } from "vitest";

import { TorrentApi } from "@/api/torrent.api";
import type { ApiTransport } from "@/api/transport.api";
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

beforeEach(() => {
  patchSettings({ searchProxyUrls: {} });
});

describe("TorrentApi", () => {
  it("sends both hash casings when renaming a torrent", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new TorrentApi({ transport });

    await api.setTorrentAlias(3, "My Title", "abc123");

    expect(calls[0]).toEqual({
      command: "set_torrent_alias",
      args: { id: 3, alias: "My Title", info_hash: "abc123", infoHash: "abc123" },
    });
  });

  it("clears the alias with null", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new TorrentApi({ transport });

    await api.setTorrentAlias(3, null);

    expect(calls[0]).toMatchObject({
      command: "set_torrent_alias",
      args: { id: 3, alias: null },
    });
  });

  it("sends both hash casings on mutations", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new TorrentApi({ transport });

    await api.pauseTorrent(3, "abc123");
    await api.addTorrentTracker(3, "udp://t", "abc123");

    expect(calls[0]).toEqual({
      command: "pause_torrent",
      args: { id: 3, info_hash: "abc123", infoHash: "abc123" },
    });
    expect(calls[1]).toEqual({
      command: "add_torrent_tracker",
      args: { id: 3, tracker: "udp://t", info_hash: "abc123", infoHash: "abc123" },
    });
  });

  it("exports the torrent file with both path casings", async () => {
    const { calls, transport } = fakeTransport(() => "/tmp/x.torrent");
    const api = new TorrentApi({ transport });

    await api.exportTorrentFile(3, "/tmp/x.torrent", "abc123");

    expect(calls[0]).toEqual({
      command: "export_torrent_file",
      args: {
        id: 3,
        out_path: "/tmp/x.torrent",
        outPath: "/tmp/x.torrent",
        info_hash: "abc123",
        infoHash: "abc123",
      },
    });
  });

  it("resolves the proxy per source", () => {
    patchSettings({ searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" } });
    const api = new TorrentApi({ proxies: () => settingsAtoms.searchProxyUrls.get() });
    expect(api.proxyFor("rutracker")).toBe("socks5://127.0.0.1:10808");
    expect(api.proxyFor("nyaa")).toBeUndefined();
  });

  it("prefers constructor proxies over the store", () => {
    const api = new TorrentApi({ proxies: { nyaa: "http://127.0.0.1:7890" } });
    expect(api.proxyFor("nyaa")).toBe("http://127.0.0.1:7890");
  });

  it("routes source searches with the source proxy", async () => {
    patchSettings({ searchProxyUrls: { nyaa: "http://127.0.0.1:7890" } });
    const { calls, transport } = fakeTransport(() => []);
    const api = new TorrentApi({
      transport,
      proxies: () => settingsAtoms.searchProxyUrls.get(),
    });

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
});
