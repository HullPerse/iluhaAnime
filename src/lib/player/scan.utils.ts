import { buildTree } from "@/lib/player/tree.utils";
import type { FolderScanResult } from "@/types/fs";
import type { FolderNode } from "@/types/torrent";

export function fingerprint(paths: string[], extensions: string[]): string {
  return `${extensions.join(",")}\n${paths.join("\n")}`;
}

export function folderTreesFromScan(results: FolderScanResult[]): FolderNode[] {
  const trees: FolderNode[] = [];
  for (const result of results) {
    if (result.entries.length > 0) trees.push(buildTree(result.entries, result.path));
  }
  return trees;
}
