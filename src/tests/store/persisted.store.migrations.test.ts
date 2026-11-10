import { describe, expect, it, vi } from "vitest";

import { createCacheSignalStore } from "@/store/cache.store";
import { createCollectionSignalStore } from "@/store/collection.store";
import { createSearchSignalStore } from "@/store/search.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function memoryStorage(backing: Map<string, string>): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  };
}

function envelope(store: string, sv: number, data: Record<string, unknown>): string {
  return JSON.stringify({ f: 1, store, sv, ts: 1, data });
}

describe("persisted store migrations", () => {
  it("applies collection v4 defaults from the stored schema version", () => {
    const backing = new Map<string, string>([
      [
        "iluha.v1.collection-ui",
        envelope("collection-ui", 3, {
          groupByStatus: true,
          viewMode: "list",
          displayMode: "scroll",
        }),
      ],
    ]);

    const store = createCollectionSignalStore({
      getStorage: () => memoryStorage(backing),
    });

    expect(store.atoms.groupByStatus.get()).toBe(false);
    expect(store.atoms.viewMode.get()).toBe("grid");
    expect(store.atoms.displayMode.get()).toBe("pagination");
  });

  it("sanitizes malformed cache payloads instead of trusting casts", () => {
    const backing = new Map<string, string>([
      [
        "iluha.v1.cache",
        envelope("cache", 5, {
          episodeTracker: { 4: "bad", 5: 12 },
          folderTrees: [{ path: "C:/anime", tree: { name: "anime", path: "C:/anime" } }],
          lastSaveDir: 42,
          seedPreferences: { 7: "yes", 8: true },
          torrentOrder: [3, "bad", 1],
        }),
      ],
    ]);

    const store = createCacheSignalStore({
      getStorage: () => memoryStorage(backing),
    });

    expect(store.atoms.episodeTracker.get()).toEqual({ 5: 12 });
    expect(store.atoms.folderTrees.get()).toEqual([]);
    expect(store.atoms.lastSaveDir.get()).toBe("");
    expect(store.atoms.seedPreferences.get()).toEqual({ 8: true });
    expect(store.atoms.torrentOrder.get()).toEqual([3, 1]);
  });

  it("sanitizes malformed search payloads", () => {
    const backing = new Map<string, string>([
      [
        "iluha.v1.search",
        envelope("search", 4, {
          filters: { minSeeders: "many", hasMagnet: "yes" },
          filterPresets: [{ name: 4 }],
          history: ["frieren", 4],
          sortBy: "bogus",
          sortDirection: "sideways",
          spellDictionary: ["frieren", null],
        }),
      ],
    ]);

    const store = createSearchSignalStore({
      getStorage: () => memoryStorage(backing),
    });

    expect(store.atoms.filters.get().minSeeders).toBe(0);
    expect(store.atoms.filters.get().hasMagnet).toBe(false);
    expect(store.atoms.filterPresets.get()).toEqual([]);
    expect(store.atoms.history.get()).toEqual(["frieren"]);
    expect(store.atoms.sortBy.get()).toBe("seeders");
    expect(store.atoms.sortDirection.get()).toBe("desc");
    expect(store.atoms.spellDictionary.get()).toEqual(["frieren"]);
  });
});
