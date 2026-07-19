export type LanguageTag = { code: string; label: string };
export type SortKey = "seeders" | "leechers" | "size" | "date";
export type SortDirection = "asc" | "desc";

export type SettingsScraper = {
  sort: SortKey;
};

export interface SearchFilters {
  minSeeders: number;
  hasMagnet: boolean;
  quality: string;
  language: string;
  sizeMin: number;
  sizeMax: number;
  codec: string;
}

export interface SearchStore {
  history: string[];
  crossSearchQuery: string | null;
  anilistSearchQuery: string | null;
  sortBy: SortKey;
  sortDirection: SortDirection;
  filters: SearchFilters;

  addQuery: (query: string) => void;
  removeQuery: (query: string) => void;
  setCrossSearchQuery: (query: string | null) => void;
  setAnilistSearchQuery: (query: string | null) => void;
  setSortBy: (sort: SortKey) => void;
  setSortDirection: (dir: SortDirection) => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
}

export type Source = "erai-raws" | "rutracker" | "nyaa" | "nekobt" | "sukebei";
