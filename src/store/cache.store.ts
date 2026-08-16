import { create } from "zustand";
import { persist } from "zustand/middleware";

import { deleteAppCache, writeAppCache } from "@/lib/app.cache";
import type { CacheStore } from "@/types/cache";

export const useCacheStore = create<CacheStore>()(
  persist(
    (set) => ({
      clearFranchiseCache: (key) =>
        set((s) => {
          const next = { ...s.franchiseCache };
          delete next[key];
          deleteAppCache("franchise", key);
          return { franchiseCache: next };
        }),
      episodeTracker: {},
      folderTrees: [],
      franchiseCache: {},
      initialScanDone: false,
      lastSaveDir: "",
      seedPreferences: {},
      setEpisodeTracker: (tracker) => {
        writeAppCache("player", "episodeTracker", tracker);
        set({ episodeTracker: tracker });
      },
      setFolderTrees: (trees) => {
        writeAppCache("player", "folderTrees", trees);
        set({ folderTrees: trees });
      },
      setFranchiseCache: (key, graph) =>
        set((s) => {
          const entry = { graph, fetchedAt: Date.now() };
          writeAppCache("franchise", key, entry, 7 * 24 * 60 * 60);
          return {
            franchiseCache: {
              ...s.franchiseCache,
              [key]: entry,
            },
          };
        }),
      setInitialScanDone: (v) => set({ initialScanDone: v }),
      setLastSaveDir: (dir) => {
        writeAppCache("torrent", "lastSaveDir", dir);
        set({ lastSaveDir: dir });
      },
      setSeedPreference: (id, enabled) =>
        set((s) => {
          const seedPreferences = { ...s.seedPreferences, [id]: enabled };
          writeAppCache("torrent", "seedPreferences", seedPreferences);
          return { seedPreferences };
        }),
    }),
    {
      migrate: (persistedState: unknown, version: number) => {
        const state =
          persistedState && typeof persistedState === "object"
            ? persistedState
            : {};
        // Any state from version < 4 may contain stale franchise graphs that
        // were served without a backend call (including root-only / 1-node
        // entries). Drop them all so the backend cache is re-queried.
        if (version < 4) {
          return { ...state, franchiseCache: {} };
        }
        return state;
      },
      name: "cache",
      version: 4,
    }
  )
);
