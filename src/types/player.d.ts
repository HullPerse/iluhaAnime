import type { TorrentFileInfo, TorrentInfo } from "./torrent";
import type { SessionRole, SessionStatus, SyncSample } from "./session";

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

export interface FileSearchResult {
  path: string;
  name: string;
  size: number;
}

export type UpscaleToolStatus = "checking" | "ok" | "missing" | "downloading";

/** Right-hand panel tabs: the local mpv queue and, in a session, the room. */
export type PlayerPanelTab = "playlist" | "lobby";

export interface PlaylistBodyProps {
  onPlay: (index: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  onMove: (from: number, to: number) => Promise<void>;
  /** In a room the queue is room-owned: play/remove-current switch to disabled. */
  locked?: boolean;
}

export interface SessionStripProps {
  role: SessionRole;
  sample: SyncSample | null;
  status: SessionStatus | undefined;
  /** Guest: the host has gone silent and local playback is paused. */
  hostLost: boolean;
  onResumeAlone: () => void;
}

export interface LobbyPanelProps {
  role: SessionRole;
  sample: SyncSample | null;
  status: SessionStatus | undefined;
  onOffset: (offsetMs: number) => void;
  onResync: () => void;
}

export interface PlayerSidePanelProps extends PlaylistBodyProps {
  activeTab: PlayerPanelTab;
  role: SessionRole | null;
  sample: SyncSample | null;
  status: SessionStatus | undefined;
  onTabChange: (tab: PlayerPanelTab) => void;
  onOffset: (offsetMs: number) => void;
  onResync: () => void;
}
