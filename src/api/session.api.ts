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

  create(displayName: string, port: number | null = null): Promise<SessionTicket> {
    return this.call("session_create", { displayName, port });
  }

  probe(
    endpointId: string,
    addrs: string[] = []
  ): Promise<{ online: boolean; rttMs: number | null }> {
    return this.call("session_probe", { endpointId, addrs });
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
    file?: { name: string; bytes: number[] } | null,
    links?: string[]
  ): Promise<void> {
    return this.call("session_chat", {
      text,
      id,
      links: links ?? [],
      replyTo,
      fileName: file?.name ?? null,
      fileBytes: file?.bytes ?? null,
    });
  }

  chatAttachment(messageId: string): Promise<{ name: string; bytes: number[] }> {
    return this.call("session_chat_attachment", { messageId });
  }

  typing(active: boolean): Promise<void> {
    return this.call("session_typing", { active });
  }

  pin(messageId: string | null): Promise<void> {
    return this.call("session_pin", { messageId });
  }

  react(input: { messageId: string; emoji: string; add: boolean }): Promise<void> {
    return this.call("session_react", input);
  }

  setPlaylist(
    items: MediaPlanItem[],
    paths: Record<string, string> = {}
  ): Promise<void> {
    return this.call("session_set_playlist", { items, paths });
  }

  startItem(itemId: string): Promise<void> {
    return this.call("session_start_item", { itemId });
  }

  setRole(peerId: string, role: LobbyRole): Promise<void> {
    return this.call("session_set_role", { peerId, role });
  }

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

  acceptHandover(paths: Record<string, string>): Promise<SessionStatus> {
    return this.call("session_accept_handover", { paths });
  }

  addSource(itemId: string, source: SourceInfo): Promise<void> {
    return this.call("session_add_source", { itemId, source });
  }

  removeSource(itemId: string, sourceId: string): Promise<void> {
    return this.call("session_remove_source", { itemId, sourceId });
  }

  matchFolder(itemId: string, folder: string): Promise<string | null> {
    return this.call("session_match_folder", { itemId, folder });
  }

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

  publishState(input: {
    mediaId: string;
    position: number;
    isPlaying: boolean;
    rate: number;
  }): Promise<void> {
    return this.call("session_publish_state", input);
  }

  syncSample(timePos: number, mediaId: string | null): Promise<SyncSample> {
    return this.call("session_sync_sample", { mediaId, timePos });
  }

  syncRestart(): Promise<void> {
    return this.call("session_sync_restart");
  }

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
