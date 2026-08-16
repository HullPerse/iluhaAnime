import type { FolderNode } from "@/types";

/** Normalize paths for stable comparisons across Windows and POSIX separators. */
export function normalizePlayerPath(path: string): string {
  return path
    .replaceAll(/\\/g, "/")
    .replaceAll(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function isPlayerPathHidden(
  path: string,
  hiddenPaths: string[]
): boolean {
  const normalized = normalizePlayerPath(path);
  return hiddenPaths.some((hiddenPath) => {
    const hidden = normalizePlayerPath(hiddenPath);
    return normalized === hidden || normalized.startsWith(`${hidden}/`);
  });
}

export function filterTreeByHiddenPaths(
  tree: FolderNode,
  hiddenPaths: string[]
): FolderNode | null {
  if (isPlayerPathHidden(tree.path, hiddenPaths)) return null;

  const children = tree.children
    .map((child) => filterTreeByHiddenPaths(child, hiddenPaths))
    .filter((child): child is FolderNode => child !== null);

  if (tree.files.length === 0 && children.length === 0) return null;
  return { ...tree, children };
}
