import type { FolderContentChanged } from "@/types/watcher";

/** Windows paths are case-insensitive and may use either slash. */
export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

/** True when `descendant` is `ancestor` itself or lives inside it. */
export function isSameOrInside(ancestor: string, descendant: string): boolean {
  const root = normalizePath(ancestor);
  const path = normalizePath(descendant);
  return path === root || path.startsWith(`${root}/`);
}

/** Deduplicated roots from a watcher payload, preserving emit order. */
export function changedRoots(payload: FolderContentChanged): string[] {
  return [...new Set(payload.roots)];
}
