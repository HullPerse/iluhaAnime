import { create } from "zustand";
import { persist } from "zustand/middleware";

import { writeAppCache } from "@/lib/store/cache.utils";
import { moveItem } from "@/lib/utils/array.utils";
import type { CacheStore } from "@/types/cache";

export const useCacheStore = create<CacheStore>()(
  persist(
    (set) => ({
      episodeTracker: {},
      folderTrees: [],
      lastSaveDir: "",
      seedPreferences: {},
      torrentOrder: [],
      setEpisodeTracker: (tracker) => {
        writeAppCache("player", "episodeTracker", tracker);
        set({ episodeTracker: tracker });
      },
      syncTorrentOrder: (ids) =>
        set((s) => {
          const known = new Set(ids);
          const kept = s.torrentOrder.filter((id) => known.has(id));
          const missing = [...ids]
            .filter((id) => !s.torrentOrder.includes(id))
            .sort((a, b) => a - b);
          const torrentOrder = [...kept, ...missing];
          if (
            torrentOrder.length === s.torrentOrder.length &&
            torrentOrder.every((id, index) => id === s.torrentOrder[index])
          )
            return s;
          writeAppCache("torrent", "torrentOrder", torrentOrder);
          return { torrentOrder };
        }),
      moveTorrentOrder: (id, neighborId) =>
        set((s) => {
          const from = s.torrentOrder.indexOf(id);
          const to = s.torrentOrder.indexOf(neighborId);
          if (from === -1 || to === -1 || from === to) return s;
          const torrentOrder = [...s.torrentOrder];
          [torrentOrder[from], torrentOrder[to]] = [torrentOrder[to], torrentOrder[from]];
          writeAppCache("torrent", "torrentOrder", torrentOrder);
          return { torrentOrder };
        }),
      moveTorrentOrderTo: (id, targetId) =>
        set((s) => {
          const from = s.torrentOrder.indexOf(id);
          const to = s.torrentOrder.indexOf(targetId);
          if (from === -1 || to === -1) return s;
          const torrentOrder = moveItem(s.torrentOrder, from, to);
          if (torrentOrder === s.torrentOrder) return s;
          writeAppCache("torrent", "torrentOrder", torrentOrder);
          return { torrentOrder };
        }),
      setFolderTrees: (trees) => {
        writeAppCache("player", "folderTrees", trees);
        set({ folderTrees: trees });
      },
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
