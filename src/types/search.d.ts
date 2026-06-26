export type LanguageTag = { code: string; label: string };
export type SettingsScraper = {
  quality: "all" | "1080p" | "720p" | "480p";
  language: "all" | "en" | "ru" | "multi";
  sort: "seeders" | "leechers" | "size";
  encoding: "all" | "hevc" | "x264";
};
