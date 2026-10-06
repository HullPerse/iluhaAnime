/** Mirrors the Rust session module (serde rename_all = "camelCase"). */

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
  duration: number;
  /** Populated on reports only. */
  video?: VideoInfo | null;
}

export type MatchLevel = "exact" | "compatible" | "risky" | "incompatible";

export interface CompatibilityDelta {
  field: string;
  host: string;
  local: string;
}

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

/** Held start; empty peerIds = wait over, start still manual. */
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
  /** Gone past the 30 s grace window. */
  left: boolean;
  /** From the QUIC handshake, never peer-claimed; lets guests dial the elected successor (lobby.md §14.7). */
  endpointId: string;
}

export interface ChatAttachment {
  name: string;
  size: number;
}

export interface ChatMessage {
  /** Anchor for replies, pins, reactions. */
  id: string;
  from: string;
  text: string;
  at: number;
  links: string[];
  replyTo: string | null;
  /** Null = text only. */
  attachment: ChatAttachment | null;
}

export interface PlaybackState {
  revision: number;
  mediaId: string;
  position: number;
  isPlaying: boolean;
  rate: number;
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

export interface PinnedMessage {
  messageId: string;
  pinnedBy: string;
}

export interface ReactionEntry {
  messageId: string;
  emoji: string;
  /** Sorted for stable output. */
  peers: string[];
}

export interface SessionStatus {
  role: SessionRole | null;
  sessionId: string | null;
  /** Stable across guest reconnects. */
  yourPeerId: string | null;
  ticket: SessionTicket | null;
  peers: PeerInfo[];
  chat: ChatMessage[];
  plan: MediaPlanItem[];
  ready: ReadySummary;
  hostOnline: boolean;
  /** Null = nothing held. */
  waiting: WaitingFor | null;
  /** Empty for guests; never rendered verbatim. */
  paths: Record<string, string>;
  lobbyRole: LobbyRole;
  missing: Record<string, string[]>;
  /** Null = unpinned. */
  pinned: PinnedMessage | null;
  reactions: ReactionEntry[];
  /** Host listen addrs or the guest's active direct path; empty when relayed or idle. */
  addrs: string[];
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

export interface ReadySummary {
  allReady: boolean;
  peers: PeerReady[];
}

export type LagStatus = "good" | "fair" | "poor";

export type SyncInstruction =
  | { kind: "setRate"; rate: number }
  | { kind: "seek"; position: number };

export interface SyncSample {
  instruction: SyncInstruction | null;
  lag: LagStatus;
  rttMs: number;
  driftMs: number;
  correction: number;
  awaitingRestart: boolean;
  haveSnapshot: boolean;
  /** False = no instruction, guest not synced. */
  identityOk: boolean;
  offsetMs: number;
}

export interface SessionCommand {
  revision: number;
  action: ControlAction;
}

/** `path` present on the host only. */
export interface SessionStartItem {
  itemId: string;
  path: string | null;
}

export interface SessionTyping {
  peerId: string;
  active: boolean;
}

/** Null messageId = unpin. */
export interface SessionPin {
  messageId: string | null;
  pinnedBy: string;
}

export interface SessionReaction {
  messageId: string;
  emoji: string;
  peerId: string;
  add: boolean;
}

/** Host-local paths deliberately excluded. */
export interface SessionIdentity {
  sessionId: string;
  ticket: SessionTicket;
  displayName: string;
  /** Null = a fresh one is minted. */
  peerId: string | null;
  role: SessionRole;
}

/** Drafts survive tab switches. */
export interface SessionUiStore {
  displayName: string;
  joinInput: string;
  identity: SessionIdentity | null;
  setIdentity: (identity: SessionIdentity | null) => void;
  chatDraft: string;
  /** Null = no reply in progress. */
  chatReply: string | null;
  localItems: MediaPlanItem[];
  /** Guest-local item id → local path; host paths never travel the wire. */
  planPaths: Record<string, string>;
  /** Null while not on a room item; the only value that may travel as media_id. */
  playingItemId: string | null;
  /** Dropped on server echo or send failure. */
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
