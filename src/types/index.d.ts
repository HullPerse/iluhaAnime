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
};

export type ModalWindow = {
  header: string;
  onClose: () => void;
  children: ReactElement | string | any;
};
