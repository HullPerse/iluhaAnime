export type { Anime, FilePriority, FolderNode } from "./torrent";
export type { LanguageTag, SettingsScraper, SortKey, Source } from "./search";
export type { VideoFileEntry } from "./fs";
export type { SettingsTab, FFMPEGStatus, ScanType } from "./settings";

import type { ReactNode } from "react";

export type ModalWindow = {
  header: string;
  onClose: () => void;
  onBack?: () => void;
  className?: string;
  children: ReactNode;
};

export type HexType = `#${string}`;

export interface FileSearchResult {
  path: string;
  name: string;
  size: number;
}

export type Item =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };
