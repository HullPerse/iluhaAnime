import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PlaylistEntry {
  path: string;
  name: string;
}

export interface LobbyPlaybackState {
  path: string;
  file: string;
  currentTime: number;
  playing: boolean;
}

interface PlaylistStore {
  entries: PlaylistEntry[];
  playback: LobbyPlaybackState | null;
  addEntry: (entry: PlaylistEntry) => void;
  removeEntry: (index: number) => void;
  clear: () => void;
  setPlayback: (state: LobbyPlaybackState | null) => void;
  updatePlaybackTime: (time: number) => void;
  updatePlaybackPlaying: (playing: boolean) => void;
}

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set) => ({
      entries: [],
      playback: null,

      addEntry: (entry) =>
        set((state) => ({
          entries: [...state.entries, entry],
        })),

      removeEntry: (index) =>
        set((state) => ({
          entries: state.entries.filter((_, i) => i !== index),
        })),

      clear: () => set({ entries: [] }),

      setPlayback: (state) => set({ playback: state }),

      updatePlaybackTime: (time) =>
        set((state) => ({
          playback: state.playback ? { ...state.playback, currentTime: time } : null,
        })),

      updatePlaybackPlaying: (playing) =>
        set((state) => ({
          playback: state.playback ? { ...state.playback, playing } : null,
        })),
    }),
    { name: "playlist-store" },
  ),
);
