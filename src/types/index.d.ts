import { ReactElement } from "react";

export interface Anime {
  title: string;
  magnet: string;
  torrent: string;
  size: string;
  seeders: number;
  leechers: number;
  category: string;
  link: string;
}

export type LanguageTag = { code: string; label: string };
export type SettingsScraper = {
  quality: "all" | "1080p" | "720p" | "480p";
  language: "all" | "en" | "ru" | "multi";
  sort: "seeders" | "leechers" | "size";
  encoding: "all" | "hevc" | "x264";
};

export interface VideoStreamInfo {
  index: number;
  codec_type: string;
  codec_name: string;
  language: string | null;
  title: string | null;
  is_default: boolean;
  file_path?: string | null;
}

export type FilePriority = "do_not_download" | "low" | "normal" | "high";

export type ModalWindow = {
  header: string;
  onClose: () => void;
  children: ReactElement | string | any;
};

export interface VideoFileEntry {
  readonly path: string;
  readonly name: string;
  readonly size: number;
}

export interface FolderNode {
  name: string;
  path: string;
  files: VideoFileEntry[];
  children: FolderNode[];
}

export type VideoType = {
  path: string;
  file: string;
  initialTime?: number;
  remuxSrc?: string;
} | null;

export type ChapterType = {
  start_time: number;
  end_time: number;
  title: string;
};

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";
export type ScanType = {
  current: number;
  total: number;
} | null;
