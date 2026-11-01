import { TORRENT_SORTERS } from "@/config/torrent/sort.config";
import type { TorrentSort } from "@/config/search/torrentSearch.config";
import type { SortableTorrent } from "@/types/torrent/sort";

export function sortTorrents<T extends SortableTorrent>(
  list: readonly T[],
  sortBy: TorrentSort,
  ascending: boolean,
  order: readonly number[]
): T[] {
  if (sortBy === "custom") {
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...list].sort((a, b) => {
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ra === rb ? a.id - b.id : ra - rb;
    });
  }
  return [...list].sort((a, b) => {
    const cmp = TORRENT_SORTERS[sortBy]?.(a, b) ?? 0;
    return ascending ? cmp : -cmp;
  });
}
