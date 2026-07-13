export interface Anime {
  title: string;
  magnet: string;
  torrent: string;
  size: string;
  seeders: number;
  leechers: number;
  category: string;
  link: string;
}

export type FilePriority = "do_not_download" | "low" | "normal" | "high";

export interface FolderNode {
  name: string;
  path: string;
  files: { path: string; name: string; size: number }[];
  children: FolderNode[];
}

export interface TorrentInfo {
  id: number;
  name: string;
  info_hash: string;
  total_bytes: number;
  progress_bytes: number;
  uploaded_bytes: number;
  download_speed: number;
  upload_speed: number;
  peers_connected: number;
  progress: number;
  state: string;
  eta_secs: number | null;
  finished: boolean;
  error: string | null;
  save_dir: string;
  sequential_download: boolean;
}

export interface TorrentFileInfo {
  index: number;
  name: string;
  size: number;
  completed: boolean;
  selected: boolean;
  priority: FilePriority;
  exists: boolean;
}

export interface PickerTorrent {
  magnet?: string;
  fileBytes?: number[];
  id: number;
  name: string;
  files: TorrentFileInfo[];
  conflictingFiles: string[];
  hasCommonFolder: boolean;
}

export interface TorrentStore {
  torrents: TorrentInfo[];
  dlLimit: number | null;
  ulLimit: number | null;
  lastSaveDir: string;
  pendingTorrent: PickerTorrent | null;
  preparingTorrent: boolean;
  torrentFilesMap: Record<number, TorrentFileInfo[]>;

  init: () => Promise<() => void>;
  prepareTorrentDownload: (magnet: string) => Promise<void>;
  prepareTorrentDownloadFromFile: (filePath: string) => Promise<void>;
  confirmDownload: (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean,
  ) => Promise<void>;
  cancelDownload: () => Promise<void>;
  pauseTorrent: (id: number) => Promise<void>;
  resumeTorrent: (id: number) => Promise<void>;
  removeTorrent: (id: number, deleteFiles: boolean) => Promise<void>;
  setSpeedLimits: (
    dlKbps: number | null,
    ulKbps: number | null,
  ) => Promise<void>;
  loadTorrentFiles: (id: number) => Promise<void>;
  updateTorrentOnlyFiles: (id: number, indices: number[]) => Promise<void>;
  setFilePriority: (
    id: number,
    fileIndices: number[],
    priority: FilePriority,
  ) => Promise<void>;
  setSequentialDownload: (id: number, enabled: boolean) => Promise<void>;
}
