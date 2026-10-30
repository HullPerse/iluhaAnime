import type { TorrentInfo } from "@/types/torrent/torrent";

export interface TorrentListState {
  torrents: TorrentInfo[];
  lastActiveAt: Record<number, number>;
}
