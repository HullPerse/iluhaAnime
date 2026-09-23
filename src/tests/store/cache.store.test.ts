import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const storage = new Map<string, string>();

let useCacheStore: (typeof import("@/store/cache.store"))["useCacheStore"];

beforeAll(async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      removeItem: (k: string) => storage.delete(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  const mod = await import("@/store/cache.store");
  useCacheStore = mod.useCacheStore;
});

beforeEach(() => {
  storage.clear();
  useCacheStore.setState({
    episodeTracker: {},
    folderTrees: [],
    lastSaveDir: "",
    seedPreferences: {},
    torrentOrder: [],
  });
});

describe("useCacheStore", () => {
  it("stores folder trees and last save dir", () => {
    const trees = [
      {
        path: "C:\\Anime",
        tree: { children: [], files: [], name: "Anime", path: "C:\\Anime" },
      },
    ];
    useCacheStore.getState().setFolderTrees(trees);
    useCacheStore.getState().setLastSaveDir("C:\\Downloads");
    const s = useCacheStore.getState();
    expect(s.folderTrees).toEqual(trees);
    expect(s.lastSaveDir).toBe("C:\\Downloads");
  });

  it("stores seed preferences and episode tracker", () => {
    useCacheStore.getState().setSeedPreference(7, true);
    useCacheStore.getState().setEpisodeTracker({ 7: 12 });
    const s = useCacheStore.getState();
    expect(s.seedPreferences[7]).toBe(true);
    expect(s.episodeTracker[7]).toBe(12);
  });

  describe("torrentOrder", () => {
    it("appends unknown ids and drops missing ones", () => {
      useCacheStore.setState({ torrentOrder: [5, 3, 9] });
      useCacheStore.getState().syncTorrentOrder([3, 5, 7]);
      expect(useCacheStore.getState().torrentOrder).toEqual([5, 3, 7]);
    });

    it("swaps an item with its neighbor", () => {
      useCacheStore.setState({ torrentOrder: [1, 2, 3] });
      useCacheStore.getState().moveTorrentOrder(2, 1);
      expect(useCacheStore.getState().torrentOrder).toEqual([2, 1, 3]);
      useCacheStore.getState().moveTorrentOrder(2, 9);
      expect(useCacheStore.getState().torrentOrder).toEqual([2, 1, 3]);
    });

    it("drops one item onto another, shifting the rows between them", () => {
      useCacheStore.setState({ torrentOrder: [1, 2, 3, 4] });

      useCacheStore.getState().moveTorrentOrderTo(1, 3);
      expect(useCacheStore.getState().torrentOrder).toEqual([2, 3, 1, 4]);

      useCacheStore.getState().moveTorrentOrderTo(4, 2);
      expect(useCacheStore.getState().torrentOrder).toEqual([4, 2, 3, 1]);
    });

    it("ignores a drop that names an unknown row", () => {
      useCacheStore.setState({ torrentOrder: [1, 2, 3] });

      useCacheStore.getState().moveTorrentOrderTo(1, 99);
      useCacheStore.getState().moveTorrentOrderTo(99, 1);
      expect(useCacheStore.getState().torrentOrder).toEqual([1, 2, 3]);

      useCacheStore.getState().moveTorrentOrderTo(2, 2);
      expect(useCacheStore.getState().torrentOrder).toEqual([1, 2, 3]);
    });
  });

  describe("migration", () => {
    it("passes persisted state through for any version", () => {
      const migrate = useCacheStore.persist.getOptions()?.migrate;
      expect(migrate).toBeTypeOf("function");
      const state = { lastSaveDir: "x", seedPreferences: { 1: true } };
      const result = migrate!(state, 2) as typeof state;
      expect(result.lastSaveDir).toBe("x");
      expect(result.seedPreferences).toEqual({ 1: true });
    });

    it("handles non-object persisted state", () => {
      const migrate = useCacheStore.persist.getOptions()?.migrate;
      expect(migrate!(null, 2)).toEqual({});
    });
  });
});
