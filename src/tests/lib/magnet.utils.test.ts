import { describe, expect, it, vi, beforeEach } from "vitest";

import { copyMagnet, downloadMagnet, openMagnet } from "@/lib/magnet.utils";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import type { Anime } from "@/types";

const invokeSpy = vi.fn();
const writeTextSpy = vi.fn();
const openUrlSpy = vi.fn();
const prepareTorrentDownloadSpy = vi.fn();
const prepareTorrentDownloadFromBytesSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeSpy(...args),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openUrlSpy(...args),
}));

beforeEach(() => {
  invokeSpy.mockReset();
  writeTextSpy.mockReset();
  openUrlSpy.mockReset();
  prepareTorrentDownloadSpy.mockReset();
  prepareTorrentDownloadFromBytesSpy.mockReset();
  useNotificationStore.setState({ items: [], unreadCount: 0 });
  // Replace the real store actions with spies so no Tauri IPC is triggered.
  useTorrentStore.setState({
    prepareTorrentDownload: prepareTorrentDownloadSpy as never,
    prepareTorrentDownloadFromBytes:
      prepareTorrentDownloadFromBytesSpy as never,
  });
});

const item: Anime = {
  category: "topic-123",
  leechers: 5,
  link: "https://example.test/show",
  magnet: "magnet:?xt=urn:btih:direct",
  seeders: 10,
  size: "1 GiB",
  title: "Show",
  torrent: "",
};

function makeMagnets() {
  let magnets: Record<string, string> = {};
  let loading: Record<string, boolean> = {};
  return {
    getLoading: () => loading,
    getMagnets: () => magnets,
    setLoadingMagnet: (
      fn: (prev: Record<string, boolean>) => Record<string, boolean>
    ) => {
      loading = fn(loading);
    },
    setMagnets: (
      fn: (prev: Record<string, string>) => Record<string, string>
    ) => {
      magnets = fn(magnets);
    },
  };
}

describe("copyMagnet", () => {
  it("copies an existing magnet without invoking the backend", async () => {
    const m = makeMagnets();
    await copyMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
    expect(writeTextSpy).toHaveBeenCalledWith(item.magnet);
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("fetches a missing magnet from the backend and copies it", async () => {
    invokeSpy.mockResolvedValueOnce("magnet:?xt=urn:btih:fetched");
    const m = makeMagnets();
    await copyMagnet(
      { ...item, magnet: "" },
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(invokeSpy).toHaveBeenCalledWith("rutracker_get_magnet", {
      topicId: "topic-123",
    });
    expect(writeTextSpy).toHaveBeenCalledWith("magnet:?xt=urn:btih:fetched");
    expect(m.getMagnets()["https://example.test/show"]).toBe(
      "magnet:?xt=urn:btih:fetched"
    );
  });

  it("shows an error and does not copy when fetching fails", async () => {
    invokeSpy.mockRejectedValueOnce(new Error("boom"));
    const m = makeMagnets();
    await copyMagnet(
      { ...item, magnet: "" },
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(writeTextSpy).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().items[0].type).toBe("error");
  });
});

describe("openMagnet", () => {
  it("opens an existing magnet", async () => {
    const m = makeMagnets();
    await openMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
    expect(openUrlSpy).toHaveBeenCalledWith(item.magnet);
  });

  it("does nothing when no magnet is available", async () => {
    invokeSpy.mockRejectedValueOnce(new Error("boom"));
    const m = makeMagnets();
    await openMagnet(
      { ...item, magnet: "" },
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(openUrlSpy).not.toHaveBeenCalled();
  });
});

describe("downloadMagnet", () => {
  it("prefers .torrent bytes for a rutracker result (dl.php)", async () => {
    invokeSpy.mockResolvedValueOnce([1, 2, 3]);
    const m = makeMagnets();
    await downloadMagnet(
      item,
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(invokeSpy).toHaveBeenCalledWith("rutracker_get_torrent_bytes", {
      topicId: "topic-123",
    });
    expect(prepareTorrentDownloadFromBytesSpy).toHaveBeenCalledWith([1, 2, 3]);
    expect(prepareTorrentDownloadSpy).not.toHaveBeenCalled();
  });

  it("prefers .torrent bytes for a nyaa-style result (direct URL)", async () => {
    invokeSpy.mockResolvedValueOnce([9, 8, 7]);
    const m = makeMagnets();
    await downloadMagnet(
      { ...item, torrent: "https://nyaa.si/download/file.torrent" },
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(invokeSpy).toHaveBeenCalledWith("fetch_torrent_bytes", {
      url: "https://nyaa.si/download/file.torrent",
    });
    expect(prepareTorrentDownloadFromBytesSpy).toHaveBeenCalledWith([9, 8, 7]);
    expect(prepareTorrentDownloadSpy).not.toHaveBeenCalled();
  });

  it("falls back to the magnet when byte download fails", async () => {
    invokeSpy.mockRejectedValueOnce(new Error("blocked"));
    invokeSpy.mockResolvedValueOnce("magnet:?xt=urn:btih:fetched");
    const m = makeMagnets();
    await downloadMagnet(
      { ...item, magnet: "" },
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(prepareTorrentDownloadFromBytesSpy).not.toHaveBeenCalled();
    expect(prepareTorrentDownloadSpy).toHaveBeenCalledWith(
      "magnet:?xt=urn:btih:fetched"
    );
  });

  it("starts a torrent download with an already-present magnet", async () => {
    invokeSpy.mockRejectedValueOnce(new Error("blocked"));
    const m = makeMagnets();
    await downloadMagnet(
      item,
      m.getMagnets(),
      m.setMagnets,
      m.setLoadingMagnet
    );
    expect(prepareTorrentDownloadSpy).toHaveBeenCalledWith(item.magnet);
  });
});
