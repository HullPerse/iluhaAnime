import type { FolderNode } from "@/types/torrent";

import { createLruCache } from "@/lib/utils/lruCache.utils";

const NORMALIZED_PATH_CACHE = createLruCache<string, string>(5000);

function memoizedNormalize(path: string): string {
  const cached = NORMALIZED_PATH_CACHE.get(path);
  if (cached !== undefined) return cached;
  const normalized = normalizePlayerPath(path);
  NORMALIZED_PATH_CACHE.set(path, normalized);
  return normalized;
}

export function normalizePlayerPath(path: string): string {
  return path.replaceAll(/\\/g, "/").replaceAll(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
}

export function isPlayerPathHidden(path: string, hiddenPaths: string[]): boolean {
  const normalized = normalizePlayerPath(path);
  return hiddenPaths.some((hiddenPath) => {
    const hidden = normalizePlayerPath(hiddenPath);
    return normalized === hidden || normalized.startsWith(`${hidden}/`);
  });
}

function isHiddenNormalized(normalized: string, hidden: string[]): boolean {
  return hidden.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`));
}

export function filterTreeByHiddenPaths(
  tree: FolderNode,
  hiddenPaths: string[]
): FolderNode | null {
  if (hiddenPaths.length === 0) return tree;
  const hidden = hiddenPaths.map(normalizePlayerPath);
  return filterNode(tree, hidden);
}

function filterNode(tree: FolderNode, hidden: string[]): FolderNode | null {
  if (isHiddenNormalized(memoizedNormalize(tree.path), hidden)) return null;

  const files = tree.files.filter(
    (file) => !isHiddenNormalized(memoizedNormalize(file.path), hidden)
  );
  const children = tree.children
    .map((child) => filterNode(child, hidden))
    .filter((child): child is FolderNode => child !== null);

  if (files.length === 0 && children.length === 0) return null;
  // No structural change: return the original reference so memoized parents
  // and React trees below do not re-render for a no-op filter pass.
  if (
    files.length === tree.files.length &&
    children.length === tree.children.length &&
    children.every((child, index) => child === tree.children[index])
  ) {
    return tree;
  }
  return { ...tree, files, children };
}
