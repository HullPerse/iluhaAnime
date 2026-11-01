import type { Dispatch, SetStateAction } from "react";

import type { FolderNode } from "@/types/torrent/torrent";

export interface PlayerFolderSyncOptions {
  folderTrees: FolderNode[];
  setFolderTrees: Dispatch<SetStateAction<FolderNode[]>>;
  savedFolderPaths: string[];
  videoExtensions: string[];
  scanThreads: number;
}
