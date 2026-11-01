import type { TorrentDetailFile } from "@/types/torrent/torrent";

export interface TorrentFileNode {
  folders: Map<string, TorrentFileNode>;
  files: TorrentDetailFile[];
}
