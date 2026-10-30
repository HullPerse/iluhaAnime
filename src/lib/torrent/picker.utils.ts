import type { TorrentInfo } from "@/types/torrent/torrent";

export function isDownloadBlocked(
  pending: boolean,
  saveDir: string,
  selectedCount: number,
  duplicate: TorrentInfo | null
): boolean {
  return pending || selectedCount === 0 || !saveDir || duplicate !== null;
}
