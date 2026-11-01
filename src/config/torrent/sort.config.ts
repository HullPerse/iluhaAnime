import type { TorrentSorterMap } from "@/types/torrent/sort";

export const TORRENT_SORTERS: TorrentSorterMap = {
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => a.total_bytes - b.total_bytes,
  progress: (a, b) => a.progress - b.progress,
  speed: (a, b) => a.download_speed - b.download_speed,
};

export const LIFECYCLE_TABS = ["all", "staging", "live", "paused", "seeding", "completed"] as const;
