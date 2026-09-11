export interface Anime {
  title: string;
  magnet: string;
  torrent: string;
  size: string;
  seeders: number;
  leechers: number;
  category: string;
  link: string;
  website?: string;
}

export interface TorrentDetailField {
  label: string;
  value: string;
}

export interface TorrentDetailFile {
  name: string;
  size: string;
}

export interface TorrentDetailComment {
  author: string;
  date: string;
  text: string;
}

export interface TorrentDetails {
  source: string;
  url: string;
  title: string;
  description: string;
  category: string;
  size: string;
  uploadedAt: string;
  updatedAt: string;
  seeders: number;
  leechers: number;
  completed: number;
  downloads: number;
  infoHash: string;
  magnet: string;
  torrentUrl: string;
  fields: TorrentDetailField[];
  files: TorrentDetailFile[];
  screenshots: string[];
  comments: TorrentDetailComment[];
  notice: string | null;
}

export type FilePriority = "do_not_download" | "normal";

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
  share_ratio: number;
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
  progress_bytes: number;
  completed: boolean;
  selected: boolean;
  priority: FilePriority;
  exists: boolean;
}

export interface TorrentLimits {
  downloadBps: number | null;
  uploadBps: number | null;
}

export interface SpeedLimits {
  download: number | null;
  upload: number | null;
}

export interface TorrentCheckResult {
  id: number;
  missing: string[];
  size_mismatch: string[];
  ok: number;
  total: number;
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

export interface CachedTorrentMeta {
  name: string;
  files: TorrentFileInfo[];
  conflictingFiles: string[];
  hasCommonFolder: boolean;
  savedAt: number;
}

export interface TorrentStore {
  lastActiveAt: Record<number, number>;
  limits: SpeedLimits;
  pendingTorrent: PickerTorrent | null;
  preparingTorrent: boolean;
  metadataCache: Map<string, CachedTorrentMeta>;
  opInFlight: Record<number, "pause" | "resume" | "remove">;

  confirmDownload: (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean
  ) => Promise<void>;
  cancelDownload: () => Promise<void>;
  prepareTorrentDownload: (magnet: string) => Promise<void>;
  prepareTorrentDownloadFromFile: (filePath: string) => Promise<void>;
  prepareTorrentDownloadFromBytes: (fileBytes: number[]) => Promise<void>;
  setSpeedLimits: (limits: SpeedLimits) => Promise<void>;
  setTorrentLimits: (id: number, limits: SpeedLimits, infoHash?: string) => Promise<void>;
  getTorrentLimits: (id: number) => Promise<TorrentLimits>;
}

export type TorrentDisplayState =
  | "downloading"
  | "seeding"
  | "done"
  | "error"
  | "stalled"
  | "paused";

export type TorrentLifecycle = "staging" | "live" | "paused" | "seeding" | "completed";

export interface FileGroup {
  dir: string;
  files: {
    index: number;
    name: string;
    displayName: string;
    size: number;
    completed?: boolean;
    selected?: boolean;
    priority?: FilePriority;
    exists?: boolean;
  }[];
}

export interface TorrentTreeNode {
  name: string;
  files: TorrentTreeFile[];
  children: TorrentTreeNode[];
}

export interface TorrentTreeFile {
  index: number;
  name: string;
  displayName: string;
  size: number;
  progress_bytes: number;
  completed: boolean;
  selected: boolean;
  priority: FilePriority;
  exists: boolean;
}

export type TorrentTreeFileWithPath = TorrentTreeFile & { fullPath: string };

export type Item =
  | { kind: "folder"; node: TorrentTreeNode; depth: number }
  | { kind: "file"; file: TorrentTreeFile; depth: number };

export interface TorrentView {
  source: string;
  url: string;
  title: string;
  description: string;
  category: string;
  size: string;
  uploadedAt: string;
  updatedAt: string;
  seeders: number;
  leechers: number;
  completed: number;
  downloads: number;
  infoHash: string;
  magnet: string;
  torrentUrl: string;
  fields: TorrentDetailField[];
  files: TorrentDetailFile[];
  screenshots: string[];
  comments: TorrentDetailComment[];
  notice: string | null;
}

export interface CollectableNode {
  files: { index: number }[];
  children: CollectableNode[];
}

export interface TorrentItemProps {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  filesError?: string;
  isExpanded: boolean;
  busy: boolean;
  onToggleExpand: () => void;
  onPause: () => void;
  onResume: () => void;
  onSeedChange: (enabled: boolean) => void;
  onRemove: (deleteFiles: boolean) => void;
  onUpdateFiles: (indices: number[]) => void;
  onFilePriorityChange: (indices: number[], priority: FilePriority) => void;
  onSetSequential: (enabled: boolean) => void;
  onRetry: () => void;
  onRedownload: (fileIndex: number) => void;
  onRecheck: () => void;
}

export interface MagnetTorrentProps {
  open: boolean;
  onClose: () => void;
  onAddMagnet: (magnet: string) => void;
  onAddFile: (filePath: string) => void;
}

export interface SpeedTorrentProps {
  limits: SpeedLimits;
  downloadInput: string;
  uploadInput: string;
  onDownloadChange: (value: string) => void;
  onUploadChange: (value: string) => void;
  onApply: () => void;
}
