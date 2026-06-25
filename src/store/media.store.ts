import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_ENTRIES = 50;

export interface MediaEntry {
  path: string;
  position: number;
  audioTrack?: number;
  subtitleTrack?: number;
  subOffset: number;
  lastPlayed: number;
}

interface MediaStore {
  entries: MediaEntry[];
  getEntry: (path: string) => MediaEntry | undefined;
  setPosition: (path: string, time: number) => void;
  setTrack: (path: string, type: "audio" | "sub", index: number) => void;
  setSubOffset: (path: string, offset: number) => void;
  removeEntry: (path: string) => void;
}

function touch(entries: MediaEntry[], path: string): MediaEntry[] {
  const idx = entries.findIndex((e) => e.path === path);
  if (idx >= 0) {
    const entry = { ...entries[idx], lastPlayed: Date.now() };
    const copy = entries.filter((_, i) => i !== idx);
    copy.unshift(entry);
    return copy.slice(0, MAX_ENTRIES);
  }
  const entry: MediaEntry = { path, position: 0, subOffset: 0, lastPlayed: Date.now() };
  return [entry, ...entries].slice(0, MAX_ENTRIES);
}

export const useMediaStore = create<MediaStore>()(
  persist(
    (set, get) => ({
      entries: [],

      getEntry: (path) => get().entries.find((e) => e.path === path),

      setPosition: (path, time) =>
        set((s) => ({
          entries: touch(s.entries, path).map((e) =>
            e.path === path ? { ...e, position: time } : e,
          ),
        })),

      setTrack: (path, type, index) =>
        set((s) => ({
          entries: touch(s.entries, path).map((e) =>
            e.path === path
              ? { ...e, [type === "audio" ? "audioTrack" : "subtitleTrack"]: index }
              : e,
          ),
        })),

      setSubOffset: (path, offset) =>
        set((s) => ({
          entries: touch(s.entries, path).map((e) =>
            e.path === path ? { ...e, subOffset: offset } : e,
          ),
        })),

      removeEntry: (path) =>
        set((s) => ({
          entries: s.entries.filter((e) => e.path !== path),
        })),
    }),
    { name: "mediaState" },
  ),
);
