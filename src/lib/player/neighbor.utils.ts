import { isSameMediaPath } from "@/lib/core/cardCache.utils";
import type { PlaylistEntry } from "@/types/player/playback";

export const HOVER_DEBOUNCE_MS = 150;

export function neighborAt(
  entries: PlaylistEntry[],
  currentPath: string,
  playlistIndex: number,
  direction: "prev" | "next"
): PlaylistEntry | null {
  if (!currentPath) return null;
  const delta = direction === "prev" ? -1 : 1;
  const anchor =
    playlistIndex >= 0 && playlistIndex < entries.length ? entries[playlistIndex] : undefined;
  if (anchor && isSameMediaPath(anchor.filename, currentPath)) {
    return entries[playlistIndex + delta] ?? null;
  }
  let pos = entries.findIndex((entry) => entry.filename === currentPath);
  if (pos === -1) {
    pos = entries.findIndex(
      (entry) => entry.filename && isSameMediaPath(entry.filename, currentPath)
    );
  }
  if (pos === -1) return null;
  return entries[pos + delta] ?? null;
}
