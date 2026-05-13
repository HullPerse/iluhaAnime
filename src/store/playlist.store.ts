import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PlaylistEntry {
  path: string;
  name: string;
}

interface PlaylistStore {
  entries: PlaylistEntry[];
  addEntry: (entry: PlaylistEntry) => void;
  removeEntry: (index: number) => void;
  clear: () => void;
}

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => ({
          entries: [...state.entries, entry],
        })),

      removeEntry: (index) =>
        set((state) => ({
          entries: state.entries.filter((_, i) => i !== index),
        })),

      clear: () => set({ entries: [] }),
    }),
    { name: "playlist-store" },
  ),
);
