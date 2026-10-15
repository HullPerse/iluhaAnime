import { fileNameFromPath, mediaFileExtension } from "@/lib/media/parse.utils";
import type { VideoFileEntry } from "@/types/fs";
import type { FolderNode } from "@/types/torrent";

const PATH_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export type PlayerTreeItem =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };

export function buildTree(entries: VideoFileEntry[], rootPath: string): FolderNode {
  const normalizedRoot = rootPath.replaceAll("\\", "/").replace(/\/$/, "");
  const root: FolderNode = {
    children: [],
    files: [],
    name: fileNameFromPath(normalizedRoot) || rootPath,
    path: normalizedRoot,
  };
  const prefix = `${normalizedRoot}/`;
  const byPath = new Map<string, FolderNode>();
  byPath.set(normalizedRoot, root);

  for (const entry of entries) {
    const raw = entry.path;
    let relative: string;
    if (raw.startsWith(prefix)) {
      relative = raw.slice(prefix.length);
    } else {
      const withSlashes = raw.includes("\\") ? raw.split("\\").join("/") : raw;
      relative = withSlashes.startsWith(prefix) ? withSlashes.slice(prefix.length) : withSlashes;
    }
    if (relative.startsWith("/")) relative = relative.slice(1);
    const parts = relative.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const childPath = `${current.path}/${parts[i]}`;
      let child = byPath.get(childPath);
      if (!child) {
        child = {
          children: [],
          files: [],
          name: parts[i],
          path: childPath,
        };
        byPath.set(childPath, child);
        current.children.push(child);
      }
      current = child;
    }
    current.files.push(entry);
  }

  return root;
}

export function findFolderContainingFile(root: FolderNode, filePath: string): FolderNode | null {
  if (root.files.some((file) => file.path === filePath)) return root;
  for (const child of root.children) {
    const found = findFolderContainingFile(child, filePath);
    if (found) return found;
  }
  return null;
}

export function folderFilePaths(folder: FolderNode): string[] {
  return folder.files.map((file) => file.path).sort((a, b) => PATH_COLLATOR.compare(a, b));
}

export function allFilePaths(node: FolderNode): string[] {
  return [...node.files.map((file) => file.path), ...node.children.flatMap(allFilePaths)];
}

export function filterTreeByPaths(tree: FolderNode, matchingPaths: Set<string>): FolderNode | null {
  const filteredFiles = tree.files.filter((f) => matchingPaths.has(f.path));
  const filteredChildren = tree.children
    .map((c) => filterTreeByPaths(c, matchingPaths))
    .filter((c): c is FolderNode => c !== null);

  if (filteredFiles.length === 0 && filteredChildren.length === 0) return null;

  return { ...tree, children: filteredChildren, files: filteredFiles };
}
function slashPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function relativePath(root: string, path: string): string | null {
  const normalizedRoot = slashPath(root).replace(/\/+$/, "");
  const normalized = slashPath(path);
  if (normalized === normalizedRoot) return null;
  const prefix = `${normalizedRoot}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : null;
}

type TreeFile = FolderNode["files"][number];

function buildSubtree(name: string, path: string, rest: string[], file: TreeFile): FolderNode {
  if (rest.length <= 1) {
    return { children: [], files: [file], name, path };
  }
  const childName = rest[0] as string;
  const childPath = `${path}/${childName}`;
  return {
    children: [buildSubtree(childName, childPath, rest.slice(1), file)],
    files: [],
    name,
    path,
  };
}

function withFile(node: FolderNode, relativeParts: string[], file: TreeFile): FolderNode {
  if (relativeParts.length <= 1) {
    const files = [
      ...node.files.filter((candidate) => slashPath(candidate.path) !== slashPath(file.path)),
      file,
    ];
    return { ...node, files };
  }
  const head = relativeParts[0] as string;
  const rest = relativeParts.slice(1);
  const childPath = `${node.path}/${head}`;
  const index = node.children.findIndex((child) => child.path === childPath);
  const updated =
    index !== -1
      ? withFile(node.children[index] as FolderNode, rest, file)
      : buildSubtree(head, childPath, rest, file);
  const children =
    index !== -1
      ? node.children.map((child, position) => (position === index ? updated : child))
      : [...node.children, updated];
  return { ...node, children };
}

function withoutFile(node: FolderNode, relativeParts: string[], pathKey: string): FolderNode {
  if (relativeParts.length <= 1) {
    return {
      ...node,
      files: node.files.filter((candidate) => slashPath(candidate.path) !== pathKey),
    };
  }
  const head = relativeParts[0] as string;
  const childPath = `${node.path}/${head}`;
  const index = node.children.findIndex((child) => child.path === childPath);
  if (index === -1) return node;
  const updated = withoutFile(node.children[index] as FolderNode, relativeParts.slice(1), pathKey);
  return {
    ...node,
    children: node.children.map((child, position) => (position === index ? updated : child)),
  };
}

function pruneEmpty(node: FolderNode): FolderNode | null {
  const children = node.children
    .map(pruneEmpty)
    .filter((child): child is FolderNode => child !== null);
  if (node.files.length === 0 && children.length === 0) return null;
  return { ...node, children };
}

export function patchTreeFile(tree: FolderNode, file: TreeFile): FolderNode | null {
  const relative = relativePath(tree.path, file.path);
  if (relative === null || relative === "") return null;
  return withFile(tree, relative.split("/").filter(Boolean), file);
}

export function removeTreeFile(tree: FolderNode, path: string): FolderNode | null {
  const relative = relativePath(tree.path, path);
  if (relative === null || relative === "") return null;
  const next = withoutFile(tree, relative.split("/").filter(Boolean), slashPath(path));
  const children = next.children
    .map(pruneEmpty)
    .filter((child): child is FolderNode => child !== null);
  return { ...next, children };
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
        const ext = mediaFileExtension(file.name);
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
    const ext = mediaFileExtension(file.name);
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
