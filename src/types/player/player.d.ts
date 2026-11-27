import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent/torrent";

export type ScanType =
  | { type: "folder"; path: string; walked: number }
  | { type: "library"; current: number; total: number };

interface HiddenFolder {
  path: string;
  name: string;
}

interface HiddenTorrent {
  infoHash: string;
  name: string;
}

export interface ShaderPlayerProps {
  value: string[];
  onChange: (selected: string[]) => void;
  gpuBackend: string;
  durationSecs?: number;
}

export interface TorrentPlayerProps {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  isExpanded: boolean;
  torrentLoading: boolean;
  onToggleExpand: () => void;
  hideHeader?: boolean;
}

export interface VisibilityPlayerProps {
  folders: HiddenFolder[];
  torrents: HiddenTorrent[];
  onUnhideFolder: (path: string) => void;
  onUnhideTorrent: (infoHash: string) => void;
  onClose: () => void;
}

export interface FileSearchResult {
  path: string;
  name: string;
  size: number;
}

export type UpscaleToolStatus = "checking" | "ok" | "missing" | "downloading";

export interface PlaylistBodyProps {
  onPlay: (index: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  onMove: (from: number, to: number) => Promise<void>;
  focusedIndex?: number | null;
}

export type PlayerSidePanelProps = PlaylistBodyProps;

export interface EofModeMpvProps {
  keepOpen: string;
  loopFile: string;
  loopPlaylist: string;
}
