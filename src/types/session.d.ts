/**
 * Watch Party session types. Mirrors the Rust `session` module
 * (`src-tauri/src/session/protocol.rs` and `state.rs`), which serializes with
 * `serde(rename_all = "camelCase")`.
 */

export type SessionRole = "host" | "guest";

export type ConnectionState =
  | "direct"
  | "relay"
  | "lan"
  | "stale"
  | "reconnecting"
  | "disconnected";

export type LobbyRole = "host" | "moderator" | "viewer";

export type SourceKind = "file" | "folder" | "magnet" | "torrent" | "deepLink" | "hostSeeded";

export type SourceStatus =
  | "missing"
  | "resolving"
  | "downloading"
  | "verifying"
  | "ready"
  | "error";

export interface VideoInfo {
  codec: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface MediaIdentity {
  sha256: string;
  size: number;
  /** Duration in seconds. */
  duration: number;
  /** Video parameters when the file has a video stream (report only). */
  video?: VideoInfo | null;
}

/** How well a local file matches the host identity. */
export type MatchLevel = "exact" | "compatible" | "risky" | "incompatible";

/** One field that differs between the host and the local file. */
export interface CompatibilityDelta {
  field: string;
  host: string;
  local: string;
}

/** The compatibility report shown next to a guest's chosen file. */
export interface CompatibilityReport {
  level: MatchLevel;
  deltas: CompatibilityDelta[];
}

export interface SourceInfo {
  sourceId: string;
  kind: SourceKind;
  label: string | null;
  value: string | null;
  status: SourceStatus;
}

export interface MediaPlanItem {
  itemId: string;
  order: number;
  title: string;
  identity: MediaIdentity;
  sources: SourceInfo[];
}

export interface ItemReport {
  itemId: string;
  present: boolean;
  verified: boolean;
}

/**
 * A start the room is holding until the listed peers obtain `itemId`
 * (empty `peerIds` means the wait is over but nothing has started yet).
 */
export interface WaitingFor {
  itemId: string;
  peerIds: string[];
}

export interface PeerInfo {
  peerId: string;
  displayName: string;
  avatarSeed: string;
  anilistUserId: number | null;
  role: LobbyRole;
  connection: ConnectionState;
  ready: boolean;
  driftMs: number;
  rttMs: number;
  buffering: boolean;
  /** The host marked this peer gone past the 30 s grace window. */
  left: boolean;
  /**
   * This peer's dialable endpoint id, read from the QUIC handshake by the host.
   * Guests keep it so that, if the host dies, the elected successor can be
   * dialed straight from the replicated roster (lobby.md §14.7).
   */
  endpointId: string;
}

export interface ChatAttachment {
  name: string;
  /** Raw byte size of the attached `.torrent`. */
  size: number;
}

export interface ChatMessage {
  /** Stable id: the anchor for replies, pins, and reactions. */
  id: string;
  from: string;
  text: string;
  /** Wall-clock seconds. */
  at: number;
  links: string[];
  /** Id of the message this one replies to. */
  replyTo: string | null;
  /** Attached `.torrent` metadata (`null` = text only). */
  attachment: ChatAttachment | null;
}

export interface PlaybackState {
  revision: number;
  mediaId: string;
  position: number;
  isPlaying: boolean;
  rate: number;
  /** Monotonic milliseconds on the host clock. */
  updatedAtMono: number;
}

export type ControlAction =
  | { a: "play" }
  | { a: "pause" }
  | { a: "seek"; position: number }
  | { a: "setRate"; rate: number }
  | { a: "load"; mediaId: string };

export interface TrackState {
  mediaId: string;
  audio: string | null;
  sub: string | null;
  audioDelay: number;
  subDelay: number;
}

export interface SessionTicket {
  sessionId: string;
  token: string;
  endpointId: string;
}

export interface SessionSnapshot {
  playback: PlaybackState;
  plan: MediaPlanItem[];
}

export interface SessionStatus {
  role: SessionRole | null;
  sessionId: string | null;
  /** This instance's own roster peer id, stable across a guest's reconnect. */
  yourPeerId: string | null;
  ticket: SessionTicket | null;
  peers: PeerInfo[];
  chat: ChatMessage[];
  plan: MediaPlanItem[];
  ready: ReadySummary;
  /** Whether the host is reachable (always true while hosting). */
  hostOnline: boolean;
  /** A start the room is holding, if any (`null` = nothing held). */
  waiting: WaitingFor | null;
  /** Host-local item id → file path; empty for guests. Never rendered verbatim. */
  paths: Record<string, string>;
  /** This instance's lobby role (host, moderator, or viewer). */
  lobbyRole: LobbyRole;
  /** For each plan item, the peer ids that have not reported it present. */
  missing: Record<string, string[]>;
}

export interface PeerReport {
  peerId: string;
  mediaTime: number;
  isPlaying: boolean;
  rate: number;
  buffering: boolean;
  mediaId: string;
  ready: boolean;
  rttMs: number;
  driftMs: number;
  atMs: number;
}

export interface PeerReady {
  peerId: string;
  ready: boolean;
}

/** Host-side readiness verdict for the current plan. */
export interface ReadySummary {
  allReady: boolean;
  peers: PeerReady[];
}

/** Link quality for the sync strip badge. */
export type LagStatus = "good" | "fair" | "poor";

/** An instruction from the Rust sync engine for the local player. */
export type SyncInstruction =
  | { kind: "setRate"; rate: number }
  | { kind: "seek"; position: number };

/** One sync evaluation returned by `session_sync_sample`. */
export interface SyncSample {
  instruction: SyncInstruction | null;
  lag: LagStatus;
  rttMs: number;
  driftMs: number;
  correction: number;
  awaitingRestart: boolean;
  haveSnapshot: boolean;
  /**
   * The host snapshot's `mediaId` matches the item the local player shows;
   * when false the sample carries no instruction and the guest is not synced.
   */
  identityOk: boolean;
  offsetMs: number;
}

/** Payload of the `session-command` event. */
export interface SessionCommand {
  revision: number;
  action: ControlAction;
}

/**
 * Payload of the `session-start-item` event. `path` is the host-local file for
 * the item, present only on the host.
 */
export interface SessionStartItem {
  itemId: string;
  path: string | null;
}

/** Payload of the `session-typing` event: which peer and in which state. */
export interface SessionTyping {
  peerId: string;
  active: boolean;
}

/**
 * Persisted guest identity: enough to offer a reconnect after an app restart.
 * Host-local paths and plan-path mappings are deliberately excluded.
 */
export interface SessionIdentity {
  sessionId: string;
  ticket: SessionTicket;
  displayName: string;
  /** This instance's own peer id when it was known; a fresh one is minted otherwise. */
  peerId: string | null;
  role: SessionRole;
}

/** Local-only lobby UI state (drafts survive tab switches). */
export interface SessionUiStore {
  displayName: string;
  joinInput: string;
  /** Persisted guest identity (`null` = no room to restore). */
  identity: SessionIdentity | null;
  setIdentity: (identity: SessionIdentity | null) => void;
  chatDraft: string;
  /**
   * Id of the message the composer is replying to (local UI state, cleared on
   * send and on reset). `null` = no reply in progress.
   */
  chatReply: string | null;
  /** Plan items entered locally before they are pushed to the host. */
  localItems: MediaPlanItem[];
  /**
   * Guest-local item id → local file path, resolved when the guest matches a
   * copy. The host's own paths never travel over the wire; a guest resolves
   * each item against these to open a `load` command locally.
   */
  planPaths: Record<string, string>;
  /**
   * Plan item id the local player is actually showing, set by the room-driven
   * open path and cleared on reset. `null` while the player is not on a room
   * item — the only value that may travel on the wire as `media_id`.
   */
  playingItemId: string | null;
  /**
   * Optimistically echoed outgoing chat lines, keyed by the client-generated
   * id. Dropped once the server echoes the same id (or the send fails).
   */
  pendingChats: ChatMessage[];
  setDisplayName: (value: string) => void;
  setJoinInput: (value: string) => void;
  setChatDraft: (value: string) => void;
  setChatReply: (value: string | null) => void;
  setLocalItems: (items: MediaPlanItem[]) => void;
  setPlanPath: (itemId: string, path: string) => void;
  setPlayingItemId: (itemId: string | null) => void;
  addPendingChat: (message: ChatMessage) => void;
  removePendingChat: (id: string) => void;
  clearPlanPaths: () => void;
  reset: () => void;
}
