import type {
  ControlAction,
  ItemReport,
  LobbyRole,
  MediaIdentity,
  MediaPlanItem,
  PeerReport,
  SessionSnapshot,
  SessionStatus,
  SessionTicket,
  SourceInfo,
  SyncSample,
  TrackState,
} from "@/types/session";

import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

export interface SessionApiConfig {
  transport?: ApiTransport;
}

/**
 * Watch Party commands. One instance per transport; the tests inject a fake
 * transport to assert command names and argument shapes.
 */
export class SessionApi {
  private readonly call: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

  constructor(config: SessionApiConfig = {}) {
    const transport = config.transport ?? tauriTransport;
    this.call = <T>(command: string, args?: Record<string, unknown>) =>
      transport.call<T>(command, args);
  }

  status(): Promise<SessionStatus> {
    return this.call("session_status");
  }

  snapshot(): Promise<SessionSnapshot> {
    return this.call("session_state");
  }

  create(displayName: string): Promise<SessionTicket> {
    return this.call("session_create", { displayName });
  }

  join(
    ticket: SessionTicket,
    displayName: string,
    anilistUserId: number | null = null,
    peerId: string | null = null
  ): Promise<SessionStatus> {
    return this.call("session_join", {
      ticket,
      displayName,
      anilistUserId,
      peerId,
    });
  }

  leave(): Promise<void> {
    return this.call("session_leave");
  }

  chat(
    text: string,
    id?: string,
    replyTo?: string | null,
    file?: { name: string; bytes: number[] } | null
  ): Promise<void> {
    return this.call("session_chat", {
      text,
      id,
      replyTo,
      fileName: file?.name ?? null,
      fileBytes: file?.bytes ?? null,
    });
  }

  /** Fetch a chat `.torrent` attachment's bytes for the download picker. */
  chatAttachment(messageId: string): Promise<{ name: string; bytes: number[] }> {
    return this.call("session_chat_attachment", { messageId });
  }

  /** Tell the room this user started (or stopped) typing. */
  typing(active: boolean): Promise<void> {
    return this.call("session_typing", { active });
  }

  setPlaylist(
    items: MediaPlanItem[],
    paths: Record<string, string> = {}
  ): Promise<void> {
    return this.call("session_set_playlist", { items, paths });
  }

  /** Host/moderator: start a plan item (or hold until every peer has it). */
  startItem(itemId: string): Promise<void> {
    return this.call("session_start_item", { itemId });
  }

  /** Host: promote or demote a guest. */
  setRole(peerId: string, role: LobbyRole): Promise<void> {
    return this.call("session_set_role", { peerId, role });
  }

  /**
   * Host: hand the room to a chosen peer and rejoin it as a viewer. The room
   * id and token travel across; only the endpoint changes.
   */
  transferHost(input: {
    peerId: string;
    displayName: string;
    anilistUserId?: number | null;
  }): Promise<SessionStatus> {
    return this.call("session_transfer_host", {
      peerId: input.peerId,
      displayName: input.displayName,
      anilistUserId: input.anilistUserId ?? null,
    });
  }

  /**
   * Chosen successor: take the room over with this instance's local
   * item id → file path map (host-local paths are never broadcast).
   */
  acceptHandover(paths: Record<string, string>): Promise<SessionStatus> {
    return this.call("session_accept_handover", { paths });
  }

  addSource(itemId: string, source: SourceInfo): Promise<void> {
    return this.call("session_add_source", { itemId, source });
  }

  removeSource(itemId: string, sourceId: string): Promise<void> {
    return this.call("session_remove_source", { itemId, sourceId });
  }

  /** Guest: find a byte-exact local copy of an item inside a folder. */
  matchFolder(itemId: string, folder: string): Promise<string | null> {
    return this.call("session_match_folder", { itemId, folder });
  }

  /** Guest: report readiness and per-item presence to the host. */
  setReady(ready: boolean, items: ItemReport[]): Promise<void> {
    return this.call("session_set_ready", { ready, items });
  }

  control(action: ControlAction): Promise<void> {
    return this.call("session_control", { action });
  }

  requestControl(action: ControlAction): Promise<void> {
    return this.call("session_request_control", { action });
  }

  forceResync(): Promise<void> {
    return this.call("session_force_resync");
  }

  /**
   * Host: report a local snapshot. The backend stamps the revision and the
   * host-clock timestamp; the caller only supplies the observed state.
   */
  publishState(input: {
    mediaId: string;
    position: number;
    isPlaying: boolean;
    rate: number;
  }): Promise<void> {
    return this.call("session_publish_state", input);
  }

  /**
   * Guest: evaluate one sync tick against the local position (seconds).
   *
   * `mediaId` is the plan item the local player shows (`null` when it is not
   * on a room item); the backend refuses to sync a sample whose identity does
   * not match the host snapshot.
   */
  syncSample(timePos: number, mediaId: string | null): Promise<SyncSample> {
    return this.call("session_sync_sample", { mediaId, timePos });
  }

  /**
   * Guest: report that the local player restarted after a seek resync, so the
   * sync engine stops holding the `awaitingRestart` latch.
   */
  syncRestart(): Promise<void> {
    return this.call("session_sync_restart");
  }

  /** Guest: set the manual release offset (ms); returns the stored value. */
  setOffset(offsetMs: number): Promise<number> {
    return this.call("session_set_offset", { offsetMs });
  }

  syncTracks(track: TrackState): Promise<void> {
    return this.call("session_sync_tracks", { track });
  }

  report(report: PeerReport): Promise<void> {
    return this.call("session_report", { report });
  }

  mediaIdentity(path: string): Promise<MediaIdentity> {
    return this.call("media_identity", { path });
  }
}

export const sessionApi = new SessionApi();
