import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent";

export const MAGNET_RX = /^magnet:\?xt=urn:btih:/i;
export const TORRENT_PAGE_SIZE = 20;

export const PICKER_ELAPSED_TICK_MS = 1000;

export const NO_TORRENTS: TorrentInfo[] = [];

export const NO_TORRENT_FILES: TorrentFileInfo[] = [];
