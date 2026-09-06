import type { TorrentFileInfo, TorrentInfo } from "./torrent";

export type ScanType = { current: number; total: number } | null;

export interface VideoStreamInfo {
  index: number;
  codec_type: string;
  codec_name: string;
  language: string | null;
  title: string | null;
  is_default: boolean;
  is_forced: boolean;
  is_comment: boolean;
  bit_rate?: number | null;
  channels?: number | null;
  sample_rate?: number | null;
  width?: number | null;
  height?: number | null;
  file_path?: string | null;
}

export interface HiddenFolder {
  path: string;
  name: string;
}

export interface HiddenTorrent {
  infoHash: string;
  name: string;
}

export interface ScanPlayerProps {
  scanProgress: ScanType;
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
