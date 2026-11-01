import type { TorrentSort } from "@/config/search/torrentSearch.config";

export interface SortableTorrent {
  id: number;
  name: string;
  total_bytes: number;
  progress: number;
  download_speed: number;
}

export type TorrentSorter = (a: SortableTorrent, b: SortableTorrent) => number;

export type TorrentSorterMap = Partial<Record<TorrentSort, TorrentSorter>>;
