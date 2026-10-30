import type { TorrentDetailFile } from "@/types/torrent/torrent";

export interface TorrentFileNode {
  folders: Map<string, TorrentFileNode>;
  files: TorrentDetailFile[];
}

export function buildTree(files: TorrentDetailFile[]): TorrentFileNode {
  const root: TorrentFileNode = { folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.name
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) continue;
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
    const leaf = parts.at(-1);
    if (leaf) node.files.push({ name: leaf, size: file.size });
  }
  return root;
}

export function countFiles(node: TorrentFileNode): number {
  let total = node.files.length;
  node.folders.forEach((child) => {
    total += countFiles(child);
  });
  return total;
}
