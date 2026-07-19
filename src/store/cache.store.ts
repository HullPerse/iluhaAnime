import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FranchiseGraph } from "@/types/anilist";
import type { FolderNode } from "@/types/torrent";

interface CacheStore {
  franchiseCache: Record<string, FranchiseGraph>;
  folderTrees: { path: string; tree: FolderNode }[];
  lastSaveDir: string;
  seedPreferences: Record<number, boolean>;
  episodeTracker: Record<number, number>;
  initialScanDone: boolean;

  setFranchiseCache: (key: string, graph: FranchiseGraph) => void;
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
          franchiseCache: { ...s.franchiseCache, [key]: graph },
        })),

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
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          return { ...persistedState, franchiseCache: {} };
        }
        return persistedState;
      },
    },
  ),
);
