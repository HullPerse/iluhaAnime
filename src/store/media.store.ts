import { MediaEntry, MediaStore } from "@/types/player";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSettingsStore } from "@/store/settings.store";

function touch(entries: MediaEntry[], path: string): MediaEntry[] {
  const max = useSettingsStore.getState().continueWatchingMax;
  const idx = entries.findIndex((e) => e.path === path);
  if (idx >= 0) {
    const entry = { ...entries[idx], lastPlayed: Date.now() };
    const copy = entries.filter((_, i) => i !== idx);
    copy.unshift(entry);
    return copy.slice(0, max);
  }
  const entry: MediaEntry = {
    path,
    position: 0,
    subOffset: 0,
    lastPlayed: Date.now(),
  };
  return [entry, ...entries].slice(0, max);
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
              ? {
                  ...e,
                  [type === "audio" ? "audioTrack" : "subtitleTrack"]: index,
                }
              : e,
          ),
        })),

      setSubOffset: (path, offset) =>
        set((s) => ({
          entries: touch(s.entries, path).map((e) =>
            e.path === path ? { ...e, subOffset: offset } : e,
          ),
        })),

      clearEntries: () => set({ entries: [] }),
    }),
    { name: "mediaState" },
  ),
);
