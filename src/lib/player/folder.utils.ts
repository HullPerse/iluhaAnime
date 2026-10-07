import { FOLDER_MAX_VIEWPORT_MARGIN, FOLDER_MIN_HEIGHT } from "@/config/player/folders.config";

export function maxFolderHeight(): number {
  return Math.max(FOLDER_MIN_HEIGHT, window.innerHeight - FOLDER_MAX_VIEWPORT_MARGIN);
}

export type FolderSnapshot = Record<string, string[]>;

export function diffFolderSnapshot(
  snapshot: FolderSnapshot | null,
  path: string,
  current: string[]
): { fresh: string[]; next: FolderSnapshot } {
  const known = new Set(snapshot?.[path] ?? []);
  const seenBefore = snapshot != null && path in snapshot;
  const fresh = seenBefore ? current.filter((file) => !known.has(file)) : [];
  return { fresh, next: { ...snapshot, [path]: [...current].sort() } };
}
