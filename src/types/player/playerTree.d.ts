import type { FolderNode } from "@/types/torrent/torrent";

export type PlayerTreeItem =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };
