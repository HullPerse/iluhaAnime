import type { CompatibilityReport, MatchLevel, MediaPlanItem, SessionStatus } from "./session";

/** One row of the lobby media plan. */
export interface PlanItemRowProps {
  item: MediaPlanItem;
  /** Zero-based plan order, rendered as a 1-based index. */
  index: number;
  isHost: boolean;
  /** This instance may start items (host or moderator). */
  canStart: boolean;
  /** The room is holding this item's start until the missing peers get it. */
  isHeld: boolean;
  /** Display names of the peers that have not reported this item present. */
  missingNames: string[];
  /** Guest: how the local file compares to the host identity (`undefined` = none). */
  report: CompatibilityReport | undefined;
  /** Guest: a finished download is being hashed against the plan identity. */
  verifying?: boolean;
  /** Guest: the finished download mismatched (`null` = no failure). */
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
  /** Guest: the finished download mismatched; start the download flow over. */
  onRedownload: () => void;
  onStartItem: () => void;
}

/** The lobby media plan panel. */
export interface PlaylistLobbyProps {
  status: SessionStatus;
}

/** The active room view (roster, plan, chat). */
export interface RoomLobbyProps {
  status: SessionStatus;
}

/** The join/create form shown when no session is active. */
export interface ConnectLobbyProps {
  loading: boolean;
}

/** One address-book entry: a room this instance joined or the host saved. */
export interface SavedConnection {
  /** Stable key and dial target: the host endpoint id from the ticket. */
  endpointId: string;
  /** The room id, carried so the entry can be re-joined. */
  sessionId: string;
  /** The room secret; with `endpointId` this rebuilds the full ticket. */
  token: string;
  /** Entry title: the host's display name by default, renameable by the user. */
  name: string;
  /** The host's display name as seen at save time; shown under the title. */
  nick: string;
  /** Last known direct `ip:port` paths used to reach the room (deduped). */
  addrs: string[];
  /** Wall-clock ms of the last save; orders the list newest first. */
  savedAt: number;
}

/** The address-book panel shown beside the join/create form. */
export interface SavedLobbyProps {
  /** Puts this entry's room code into the join form. */
  onUse: (connection: SavedConnection) => void;
}
