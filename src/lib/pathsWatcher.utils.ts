import type { FolderContentChanged } from "@/types/watcher";

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function isSameOrInside(ancestor: string, descendant: string): boolean {
  const root = normalizePath(ancestor);
  const path = normalizePath(descendant);
  return path === root || path.startsWith(`${root}/`);
}

export function changedRoots(payload: FolderContentChanged): string[] {
  return [...new Set(payload.roots)];
}
