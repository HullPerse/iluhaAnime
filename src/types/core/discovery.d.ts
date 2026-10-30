import type { AniListFilters, AniMedia } from "@/types/anilist/anilist";

export interface DiscoveryQueue<T> {
  history: T[];
  index: number;
  current: T | undefined;
  total: number;
  canPrev: boolean;
  push: (item: T) => void;
  prev: () => void;
  reset: () => void;
}

export interface RandomDiscovery {
  open: boolean;
  current: AniMedia | undefined;
  index: number;
  total: number;
  canPrev: boolean;
  pending: boolean;
  start: (filters: AniListFilters) => void;
  reroll: () => void;
  prev: () => void;
  close: () => void;
}
