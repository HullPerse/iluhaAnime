import type { CompatibilityReport, MatchLevel, MediaPlanItem, SessionStatus } from "./session";

export interface PlanItemRowProps {
  item: MediaPlanItem;
  index: number;
  isHost: boolean;
  canStart: boolean;
  /** Held until the missing peers get it. */
  isHeld: boolean;
  missingNames: string[];
  /** undefined = none. */
  report: CompatibilityReport | undefined;
  verifying?: boolean;
  /** null = no failure. */
  verifyFailed?: MatchLevel | null;
  sourceDraft: string;
  fileDraft: string;
  onSourceDraftChange: (value: string) => void;
  onFileDraftChange: (value: string) => void;
  onAddSource: () => void;
  onRemoveSource: (sourceId: string) => void;
  onCreateTorrent: () => void;
  onRemoveItem: () => void;
  onUseFile: () => void;
  onPickFolder: () => void;
  onDownloadFromHost: () => void;
  onRedownload: () => void;
  onStartItem: () => void;
}

export interface PlaylistLobbyProps {
  status: SessionStatus;
}

export interface RoomLobbyProps {
  status: SessionStatus;
}

export interface ConnectLobbyProps {
  loading: boolean;
}

export interface SavedConnection {
  endpointId: string;
  sessionId: string;
  /** With endpointId this rebuilds the full ticket. */
  token: string;
  /** Defaults to the host's display name. */
  name: string;
  nick: string;
  /** Deduped direct ip:port paths. */
  addrs: string[];
  /** Orders the list newest first. */
  savedAt: number;
}

export interface SavedLobbyProps {
  onUse: (connection: SavedConnection) => void;
}
