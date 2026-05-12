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

export type ModalWindow = {
  header: string;
  onClose: () => void;
  children: ReactElement | string | any;
};
