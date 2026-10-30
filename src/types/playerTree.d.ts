import type { FolderNode } from "@/types/torrent";

export type PlayerTreeItem =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };
