import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

import type { FranchiseGraph } from "@/types/anilist";

// zustand v5 only exposes the persist API when storage is available, so we
// stub localStorage before dynamically importing the store.
const storage = new Map<string, string>();

function makeGraph(): FranchiseGraph {
  return {
    edges: [],
    nodes: [
      {
        id: 1,
        title: "Root",
        cover_url: null,
        episodes: null,
        score: null,
        format: null,
        media_type: "ANIME",
        year: 2000,
      },
    ],
    root_id: 1,
  };
}

let useCacheStore: (typeof import("@/store/cache.store"))["useCacheStore"];

beforeAll(async () => {
  // zustand persist reads `window.localStorage`; nothing else here touches
  // window, so a minimal stub is safe.
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
    franchiseCache: {},
    initialScanDone: false,
    lastSaveDir: "",
    seedPreferences: {},
  });
});

describe("useCacheStore", () => {
  it("starts with empty defaults", () => {
    const s = useCacheStore.getState();
    expect(s.franchiseCache).toEqual({});
    expect(s.folderTrees).toEqual([]);
    expect(s.lastSaveDir).toBe("");
    expect(s.initialScanDone).toBe(false);
  });

  it("stores and clears franchise graphs", () => {
    useCacheStore.getState().setFranchiseCache("123:all", makeGraph());
    const entry = useCacheStore.getState().franchiseCache["123:all"];
    expect(entry.graph.root_id).toBe(1);
    expect(entry.fetchedAt).toBeGreaterThan(0);

    useCacheStore.getState().clearFranchiseCache("123:all");
    expect(useCacheStore.getState().franchiseCache["123:all"]).toBeUndefined();
  });

  it("keeps unrelated cache keys when clearing one", () => {
    useCacheStore.getState().setFranchiseCache("a", makeGraph());
    useCacheStore.getState().setFranchiseCache("b", makeGraph());
    useCacheStore.getState().clearFranchiseCache("a");
    expect(useCacheStore.getState().franchiseCache["b"]).toBeDefined();
  });

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

  it("tracks the initial scan flag", () => {
    useCacheStore.getState().setInitialScanDone(true);
    expect(useCacheStore.getState().initialScanDone).toBe(true);
  });

  describe("migration", () => {
    it("clears franchise cache for versions below 4", () => {
      const migrate = useCacheStore.persist.getOptions()?.migrate;
      expect(migrate).toBeTypeOf("function");
      const result = migrate!(
        {
          franchiseCache: { old: { fetchedAt: 1, graph: makeGraph() } },
          lastSaveDir: "x",
        },
        3
      ) as { franchiseCache: unknown; lastSaveDir: string };
      expect(result.franchiseCache).toEqual({});
      expect(result.lastSaveDir).toBe("x");
    });

    it("keeps state for version 4", () => {
      const migrate = useCacheStore.persist.getOptions()?.migrate;
      const state = {
        franchiseCache: { k: { fetchedAt: 1, graph: makeGraph() } },
      };
      const result = migrate!(state, 4) as { franchiseCache: unknown };
      expect(result.franchiseCache).toEqual(state.franchiseCache);
    });

    it("handles non-object persisted state", () => {
      const migrate = useCacheStore.persist.getOptions()?.migrate;
      expect(migrate!(null, 3)).toEqual({ franchiseCache: {} });
    });
  });
});
