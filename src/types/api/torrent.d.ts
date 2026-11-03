import type { ApiTransport } from "@/types/core/transport";
import type { TorrentFileInfo } from "@/types/torrent/torrent";

export interface TorrentApiConfig {
  transport?: ApiTransport;
  proxies?: Record<string, string> | null | (() => Record<string, string> | null);
  webviewProxyEnabled?: boolean | (() => boolean);
  torrentProxyUrl?: string | null | (() => string | null);
}

export interface ProxyProbe {
  latencyMs: number;
}

export interface TorrentFilesBatchEntry {
  id: number;
  files: TorrentFileInfo[] | null;
  error: string | null;
}

export interface TorrentSearchArgs {
  query: string;
  page?: number;
  sort?: string;
  order?: string;
}

export interface StartTorrentDownloadInput {
  magnet?: string;
  fileBytes?: number[];
  saveDir: string;
  onlyFiles: number[] | null;
  subFolder: string | null;
  sequential: boolean;
  requiredBytes?: number;
}

export interface TorrentInfoResult {
  id: number;
  name: string;
  files: TorrentFileInfo[];
  conflicting_files: string[];
  has_common_folder: boolean;
}

export interface ScannedExtraFile {
  path: string;
  name: string;
  size: number;
}
