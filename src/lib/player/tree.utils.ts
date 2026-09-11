import type { VideoFileEntry } from "@/types/fs";
import type { FolderNode } from "@/types/torrent";

export type PlayerTreeItem =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };

export function buildTree(entries: VideoFileEntry[], rootPath: string): FolderNode {
  const root: FolderNode = {
    children: [],
    files: [],
    name: rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath,
    path: rootPath,
  };

  for (const entry of entries) {
    const relative = entry.path.replace(rootPath, "").replace(/^[/\\]/, "");
    const parts = relative.split(/[/\\]/);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      let child = current.children.find((c) => c.name === parts[i]);
      if (!child) {
        child = {
          children: [],
          files: [],
          name: parts[i],
          path: `${current.path}/${parts[i]}`,
        };
        current.children.push(child);
      }
      current = child;
    }
    current.files.push(entry);
  }

  return root;
}

export function filterTreeByPaths(tree: FolderNode, matchingPaths: Set<string>): FolderNode | null {
  const filteredFiles = tree.files.filter((f) => matchingPaths.has(f.path));
  const filteredChildren = tree.children
    .map((c) => filterTreeByPaths(c, matchingPaths))
    .filter((c): c is FolderNode => c !== null);

  if (filteredFiles.length === 0 && filteredChildren.length === 0) return null;

  return { ...tree, children: filteredChildren, files: filteredFiles };
}
export function summarizeTree(node: FolderNode): { count: number; bytes: number } {
  let count = node.files.length;
  let bytes = 0;
  for (const file of node.files) bytes += file.size;
  for (const child of node.children) {
    const childSummary = summarizeTree(child);
    count += childSummary.count;
    bytes += childSummary.bytes;
  }
  return { count, bytes };
}

function nodeMatchesSearch(node: FolderNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  for (const f of node.files) {
    if (f.name.toLowerCase().includes(q)) return true;
  }
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

function filterTreeFiles(
  node: FolderNode,
  query: string,
  trackExts?: Set<string>
): FolderNode["files"] {
  const files = query
    ? node.files.filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
    : node.files;
  return trackExts
    ? files.filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        return !ext || !trackExts.has(ext);
      })
    : files;
}

function shouldSkipTreeNode(node: FolderNode, files: FolderNode["files"], query: string): boolean {
  if (!query) return false;
  return files.length === 0 && !node.children.some((child) => nodeMatchesSearch(child, query));
}

function appendTreeFiles(
  items: PlayerTreeItem[],
  files: FolderNode["files"],
  depth: number,
  disabledExtensions?: Set<string>
): void {
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext && disabledExtensions?.has(ext)) continue;
    items.push({ depth: depth + 1, file, kind: "file" });
  }
}

function isEmptyTreeFolder(items: PlayerTreeItem[], node: FolderNode, depth: number): boolean {
  return (
    depth > 0 &&
    items.length === 1 &&
    items[0]?.kind === "folder" &&
    items[0].node.path === node.path
  );
}

export function flattenTree(
  node: FolderNode,
  open: Set<string>,
  searchQuery: string,
  disabledExtensions: Set<string> | undefined,
  depth: number,
  trackExts?: Set<string>
): PlayerTreeItem[] {
  if (!node.children.length && !node.files.length) return [];
  const filteredFiles = filterTreeFiles(node, searchQuery, trackExts);
  if (shouldSkipTreeNode(node, filteredFiles, searchQuery)) return [];
  const items: PlayerTreeItem[] = depth > 0 ? [{ depth, kind: "folder", node }] : [];
  const isOpen = open.has(node.path);
  if (isOpen || depth === 0) {
    appendTreeFiles(items, filteredFiles, depth, disabledExtensions);
    for (const child of node.children) {
      items.push(
        ...flattenTree(child, open, searchQuery, disabledExtensions, depth + 1, trackExts)
      );
    }
  }
  if (!isEmptyTreeFolder(items, node, depth)) return items;
  if (isOpen) return [];
  const hasContent =
    filteredFiles.length > 0 ||
    node.children.some(
      (child) =>
        flattenTree(child, open, searchQuery, disabledExtensions, depth + 1, trackExts).length > 0
    );
  return hasContent ? items : [];
}

export function buildOutputPath(inputPath: string, suffix: string): string {
  const dot = inputPath.lastIndexOf(".");
  const ext = dot > 0 ? inputPath.slice(dot) : "";
  return dot > 0 ? inputPath.slice(0, dot) + suffix + ext : inputPath + suffix;
}
