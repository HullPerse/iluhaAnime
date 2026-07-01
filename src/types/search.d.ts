export type LanguageTag = { code: string; label: string };
export type SettingsScraper = {
  quality: "all" | "1080p" | "720p" | "480p";
  language: "all" | "en" | "ru" | "multi";
  sort: "seeders" | "leechers" | "size";
  encoding: "all" | "hevc" | "x264";
};

export interface SearchStore {
  history: string[];
  crossSearchQuery: string | null;
  addQuery: (query: string) => void;
  removeQuery: (query: string) => void;
  setCrossSearchQuery: (query: string | null) => void;
}

export type Source = "erai-raws" | "rutracker" | "nyaa" | "nekobt" | "sukebei";
