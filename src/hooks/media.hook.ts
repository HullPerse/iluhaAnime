import { useSyncExternalStore } from "react";

import { mediaEntries } from "@/store/media.store";
import type { MediaEntry } from "@/types/videoPlayer";

const entrySnapshots = new WeakMap<MediaEntry[], Map<string, MediaEntry | undefined>>();

function selectMediaEntry(path: string): MediaEntry | undefined {
  const entries = mediaEntries.get();
  let byPath = entrySnapshots.get(entries);
  if (!byPath) {
    byPath = new Map();
    entrySnapshots.set(entries, byPath);
  }
  if (byPath.has(path)) return byPath.get(path);
  const found = entries.find((entry) => entry.path === path);
  byPath.set(path, found);
  return found;
}

function subscribeMediaEntries(listener: () => void): () => void {
  return mediaEntries.subscribe(listener);
}

export function useMediaEntry(path: string | null): MediaEntry | undefined {
  return useSyncExternalStore(
    subscribeMediaEntries,
    () => (path ? selectMediaEntry(path) : undefined),
    () => (path ? selectMediaEntry(path) : undefined)
  );
}
