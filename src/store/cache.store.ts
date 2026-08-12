import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FranchiseGraph } from "@/types/anilist";
import type { FolderNode } from "@/types/torrent";

export interface FranchiseCacheEntry {
  graph: FranchiseGraph;
  fetchedAt: number;
}

interface CacheStore {
  franchiseCache: Record<string, FranchiseCacheEntry>;
  folderTrees: { path: string; tree: FolderNode }[];
  lastSaveDir: string;
  seedPreferences: Record<number, boolean>;
  episodeTracker: Record<number, number>;
  initialScanDone: boolean;

  setFranchiseCache: (key: string, graph: FranchiseGraph) => void;
  clearFranchiseCache: (key: string) => void;
  setFolderTrees: (trees: { path: string; tree: FolderNode }[]) => void;
  setLastSaveDir: (dir: string) => void;
  setSeedPreference: (id: number, enabled: boolean) => void;
  setEpisodeTracker: (tracker: Record<number, number>) => void;
  setInitialScanDone: (v: boolean) => void;
}

export const useCacheStore = create<CacheStore>()(
  persist(
    (set) => ({
      franchiseCache: {},
      folderTrees: [],
      lastSaveDir: "",
      seedPreferences: {},
      episodeTracker: {},
      initialScanDone: false,

      setFranchiseCache: (key, graph) =>
        set((s) => ({
          franchiseCache: {
            ...s.franchiseCache,
            [key]: { graph, fetchedAt: Date.now() },
          },
        })),

      clearFranchiseCache: (key) =>
        set((s) => {
          const next = { ...s.franchiseCache };
          delete next[key];
          return { franchiseCache: next };
        }),

      setFolderTrees: (trees) => set({ folderTrees: trees }),

      setLastSaveDir: (dir) => set({ lastSaveDir: dir }),

      setSeedPreference: (id, enabled) =>
        set((s) => ({
          seedPreferences: { ...s.seedPreferences, [id]: enabled },
        })),

      setEpisodeTracker: (tracker) => set({ episodeTracker: tracker }),

      setInitialScanDone: (v) => set({ initialScanDone: v }),
    }),
    {
      name: "cache",
      version: 4,
      migrate: (persistedState: any, version: number) => {
        // Any state from version < 4 may contain stale franchise graphs that
        // were served without a backend call (including root-only / 1-node
        // entries). Drop them all so the backend cache is re-queried.
        if (version < 4) {
          return { ...persistedState, franchiseCache: {} };
        }
        return persistedState;
      },
    },
  ),
);
