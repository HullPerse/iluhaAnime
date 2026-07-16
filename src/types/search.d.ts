export type LanguageTag = { code: string; label: string };
export type SortKey = "seeders" | "leechers" | "size";

export type SettingsScraper = {
  sort: SortKey;
};

export interface SearchStore {
  history: string[];
  crossSearchQuery: string | null;
  addQuery: (query: string) => void;
  removeQuery: (query: string) => void;
  setCrossSearchQuery: (query: string | null) => void;
}

export type Source = "erai-raws" | "rutracker" | "nyaa" | "nekobt" | "sukebei";
