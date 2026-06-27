export type {
  Anime,
  FilePriority,
  VideoFileEntry,
  FolderNode,
} from "./torrent";
export type { LanguageTag, SettingsScraper } from "./search";
export type {
  VideoStreamInfo,
  VideoType,
  ChapterType,
  FFMPEGStatus,
  ScanType,
} from "./player";

import type { ReactNode } from "react";

export type ModalWindow = {
  header: string;
  onClose: () => void;
  children: ReactNode;
};

export type HexType = `#${string}`;
