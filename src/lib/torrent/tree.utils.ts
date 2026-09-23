import type {
  CollectableNode,
  FileGroup,
  FileOrder,
  FilePriority,
  Item,
  TorrentFileInfo,
  TorrentTreeFile,
  TorrentTreeNode,
} from "@/types/torrent";

export function applyFolderSelection(
  files: { index: number; completed: boolean; selected: boolean }[],
  folderIndices: number[],
  target: boolean
): number[] {
  const folder = new Set(folderIndices);
  return files
    .filter((file) => file.completed || (folder.has(file.index) ? target : file.selected))
    .map((file) => file.index);
}

export function collectFileIndices(node: CollectableNode): number[] {
  const indices = node.files.map((f) => f.index);
  for (const child of node.children) {
    indices.push(...collectFileIndices(child));
  }
  return indices;
}

function toTreeFile(file: TorrentFileInfo, displayName: string): TorrentTreeFile {
  return {
    completed: file.completed,
    displayName,
    exists: file.exists,
    index: file.index,
    name: file.name,
    priority: file.priority,
    progress_bytes: file.progress_bytes,
    selected: file.selected,
    size: file.size,
  };
}

function byTorrentOrder(files: TorrentFileInfo[]): TorrentTreeFile[] {
  return [...files].sort((a, b) => a.index - b.index).map((file) => toTreeFile(file, file.name));
}

export function buildTorrentTree(
  files: TorrentFileInfo[],
  order: FileOrder = "list"
): {
  nodes: TorrentTreeNode[];
  rootFiles: TorrentTreeFile[];
} {
  if (order === "torrent") {
    return { nodes: [], rootFiles: byTorrentOrder(files) };
  }

  const root: TorrentTreeNode = { children: [], files: [], name: "" };

  for (const file of files) {
    const parts = file.name.replaceAll(/\\/g, "/").split("/");
    const fileName = parts.pop()!;

    let node = root;

    for (const part of parts) {
      let child = node.children.find((c) => c.name === part);

      if (!child) {
        child = { children: [], files: [], name: part };
        node.children.push(child);
      }
      node = child;
    }

    node.files.push(toTreeFile(file, fileName));
  }

  function sortTree(node: TorrentTreeNode) {
    node.files.sort((a, b) => a.displayName.localeCompare(b.displayName));
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) sortTree(child);
  }
  for (const child of root.children) sortTree(child);

  return {
    nodes: root.children.sort((a, b) => a.name.localeCompare(b.name)),
    rootFiles: root.files.sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}

export function groupFilesByDirectory(
  files: {
    name: string;
    index: number;
    size: number;
    completed?: boolean;
    selected?: boolean;
    priority?: FilePriority;
    exists?: boolean;
  }[],
  order: FileOrder = "list"
): FileGroup[] {
  if (order === "torrent") {
    const sorted = [...files].sort((a, b) => a.index - b.index);
    return sorted.length === 0
      ? []
      : [{ dir: "", files: sorted.map((file) => ({ ...file, displayName: file.name })) }];
  }

  const groups = new Map<string, FileGroup>();

  for (const file of files) {
    const idx = file.name.search(/[/\\]/);
    if (idx === -1) {
      const dir = "";
      if (!groups.has(dir)) groups.set(dir, { dir, files: [] });
      groups.get(dir)!.files.push({ ...file, displayName: file.name });
    } else {
      const dir = file.name.slice(0, idx);
      const displayName = file.name.slice(idx + 1);
      if (!groups.has(dir)) groups.set(dir, { dir, files: [] });
      groups.get(dir)!.files.push({ ...file, displayName });
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    })
    .map(([, group]) => ({
      ...group,
      files: group.files.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
}

export function flattenTorrentTree(
  nodes: TorrentTreeNode[],
  open: Set<string>,
  fileFilter?: (f: TorrentTreeFile) => boolean,
  rootFiles?: TorrentTreeFile[],
  depth = 0
): Item[] {
  const items: Item[] = [];
  if (depth === 0 && rootFiles) {
    for (const file of rootFiles) {
      items.push({ kind: "file", file, depth: 0 });
    }
  }
  for (const node of nodes) {
    items.push({ kind: "folder", node, depth });
    if (open.has(node.name + depth)) {
      const files = fileFilter ? node.files.filter(fileFilter) : node.files;
      for (const file of files) {
        items.push({ kind: "file", file, depth: depth + 1 });
      }
      items.push(...flattenTorrentTree(node.children, open, fileFilter, undefined, depth + 1));
    }
  }
  return items;
}
