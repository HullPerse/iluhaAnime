export type {
  Anime,
  FilePriority,
  FolderNode,
} from "./torrent";
export type { LanguageTag, SettingsScraper } from "./search";

import type { ReactNode } from "react";

export type ModalWindow = {
  header: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};


export type HexType = `#${string}`;

export interface MediaCategory {
  id: string;
  name: string;
  folderPaths: string[];
  torrentIds: number[];
  collapsed: boolean;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  downloadSizeMb: number;
  downloadSizeBytes: number;
  version: string;
  installed: boolean;
}
