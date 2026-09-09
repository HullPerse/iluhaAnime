import { create } from "zustand";
import { persist } from "zustand/middleware";

import { writeAppCache } from "@/lib/store/cache.utils";
import type { CacheStore } from "@/types/cache";

export const useCacheStore = create<CacheStore>()(
  persist(
    (set) => ({
      episodeTracker: {},
      folderTrees: [],
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
      removeSeedPreference: (id) =>
        set((s) => {
          const { [id]: _, ...seedPreferences } = s.seedPreferences;
          writeAppCache("torrent", "seedPreferences", seedPreferences);
          return { seedPreferences };
        }),
    }),
    {
      migrate: (persistedState: unknown) => {
        const state = persistedState && typeof persistedState === "object" ? persistedState : {};
        return state;
      },
      name: "cache",
      version: 5,
    }
  )
);
