import type { FolderNode } from "@/types/torrent";

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
  const hidden = hiddenPaths.map(normalizePlayerPath);
  return filterNode(tree, hidden);
}

function filterNode(tree: FolderNode, hidden: string[]): FolderNode | null {
  if (isHiddenNormalized(normalizePlayerPath(tree.path), hidden)) return null;

  const files = tree.files.filter(
    (file) => !isHiddenNormalized(normalizePlayerPath(file.path), hidden)
  );
  const children = tree.children
    .map((child) => filterNode(child, hidden))
    .filter((child): child is FolderNode => child !== null);

  if (files.length === 0 && children.length === 0) return null;
  return { ...tree, files, children };
}
