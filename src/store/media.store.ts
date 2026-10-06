import { create } from "zustand";
import { persist } from "zustand/middleware";

import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { MediaEntry, MediaStore, WatchState } from "@/types/videoPlayer";

const MAX_ENTRIES = 200;

function touch(entries: MediaEntry[], path: string, now: number): MediaEntry[] {
  const existing = entries.find((entry) => entry.path === path);
  const rest = existing ? entries.filter((entry) => entry.path !== path) : entries;
  const entry: MediaEntry = existing
    ? { ...existing, lastPlayed: now }
    : {
        path,
        position: 0,
        duration: 0,
        subOffset: 0,
        audioOffset: 0,
        lastPlayed: now,
      };
  return [entry, ...rest].slice(0, MAX_ENTRIES);
}

function patchEntry(entries: MediaEntry[], path: string, patch: Partial<MediaEntry>): MediaEntry[] {
  const now = Date.now();
  return touch(entries, path, now).map((entry) =>
    entry.path === path ? { ...entry, ...patch } : entry
  );
}

export const useMediaStore = create<MediaStore>()(
  persist(
    (set, get) => ({
      entries: [],

      getEntry: (path) => get().entries.find((entry) => entry.path === path),

      setPosition: (path, time, duration) =>
        set((state) => ({
          entries: patchEntry(state.entries, path, {
            ...(duration === undefined ? {} : { duration }),
            position: time,
          }),
        })),

      setTrack: (path, type, index) =>
        set((state) => {
          const patch = type === "audio" ? { audioTrack: index } : { subtitleTrack: index };
          return { entries: patchEntry(state.entries, path, patch) };
        }),

      setSubOffset: (path, offset) =>
        set((state) => ({
          entries: patchEntry(state.entries, path, { subOffset: offset }),
        })),

      setAudioOffset: (path, offset) =>
        set((state) => ({
          entries: patchEntry(state.entries, path, { audioOffset: offset }),
        })),

      hydrate: async (path) => {
        const [stored] = await attempt(
          invokeTyped<WatchState | null>("player_load_watch", { path })
        );
        const entry = get().getEntry(path);
        if (!stored) return entry;
        const merged: MediaEntry = {
          path,
          position: stored.position,
          duration: stored.duration,
          subOffset: stored.subDelay ?? entry?.subOffset ?? 0,
          audioOffset: stored.audioDelay ?? entry?.audioOffset ?? 0,
          audioTrack: entry?.audioTrack,
          subtitleTrack: entry?.subtitleTrack,
          lastPlayed: entry?.lastPlayed ?? Date.now(),
        };
        set((state) => ({ entries: patchEntry(state.entries, path, merged) }));
        return merged;
      },

      clearEntries: () => set({ entries: [] }),
    }),
    { name: "mediaState" }
  )
);
