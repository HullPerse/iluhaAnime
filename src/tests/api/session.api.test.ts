import { describe, expect, it } from "vitest";

import { SessionApi } from "@/api/session.api";
import type { ApiTransport } from "@/api/transport.api";
import type { SessionTicket } from "@/types/session";

function fakeTransport(resolve: (command: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return resolve(command, args) as T;
    },
  };
  return { calls, transport };
}

const TICKET: SessionTicket = {
  sessionId: "a1b2c3d4e5f60718",
  token: "0123456789abcdef0123456789abcdef",
  endpointId: "ab".repeat(32),
};

describe("SessionApi", () => {
  it("maps every method to its command and argument shape", async () => {
    const { calls, transport } = fakeTransport(() => ({}));
    const api = new SessionApi({ transport });

    await api.status();
    await api.snapshot();
    await api.create("Alice");
    await api.join(TICKET, "Bob");
    await api.leave();
    await api.chat("hi");
    await api.control({ a: "seek", position: 12 });
    await api.requestControl({ a: "play" });
    await api.forceResync();
    await api.syncTracks({ audio: null, audioDelay: 0, mediaId: "m", sub: null, subDelay: 0 });
    await api.mediaIdentity("D:/anime/x.mkv");
    await api.setPlaylist([]);
    await api.addSource("i1", {
      kind: "magnet",
      label: null,
      sourceId: "s1",
      status: "missing",
      value: "magnet:?xt=urn:btih:ABC",
    });
    await api.removeSource("i1", "s1");
    await api.setReady(true, [{ itemId: "i1", present: true, verified: true }]);
    await api.matchFolder("i1", "D:/anime");
    await api.publishState({
      isPlaying: true,
      mediaId: "m",
      position: 12.5,
      rate: 1,
    });
    await api.syncSample(12.5, "i1");
    await api.setOffset(-250);
    await api.syncRestart();
    await api.startItem("i1");
    await api.setRole("p2", "moderator");
    await api.transferHost({ peerId: "p2", displayName: "Alice" });
    await api.acceptHandover({ i1: "D:/anime/mine.mkv" });

    expect(calls.map((call) => call.command)).toEqual([
      "session_status",
      "session_state",
      "session_create",
      "session_join",
      "session_leave",
      "session_chat",
      "session_control",
      "session_request_control",
      "session_force_resync",
      "session_sync_tracks",
      "media_identity",
      "session_set_playlist",
      "session_add_source",
      "session_remove_source",
      "session_set_ready",
      "session_match_folder",
      "session_publish_state",
      "session_sync_sample",
      "session_set_offset",
      "session_sync_restart",
      "session_start_item",
      "session_set_role",
      "session_transfer_host",
      "session_accept_handover",
    ]);

    expect(calls[2].args).toEqual({ displayName: "Alice", port: null });
    expect(calls[3].args).toEqual({
      anilistUserId: null,
      displayName: "Bob",
      peerId: null,
      ticket: TICKET,
    });
    expect(calls[5].args).toEqual({
      fileBytes: null,
      fileName: null,
      links: [],
      text: "hi",
    });
    expect(calls[6].args).toEqual({ action: { a: "seek", position: 12 } });
    expect(calls[9].args).toEqual({
      track: { audio: null, audioDelay: 0, mediaId: "m", sub: null, subDelay: 0 },
    });
    expect(calls[10].args).toEqual({ path: "D:/anime/x.mkv" });
    expect(calls[11].args).toEqual({ items: [], paths: {} });
    expect(calls[12].args).toEqual({
      itemId: "i1",
      source: {
        kind: "magnet",
        label: null,
        sourceId: "s1",
        status: "missing",
        value: "magnet:?xt=urn:btih:ABC",
      },
    });
    expect(calls[13].args).toEqual({ itemId: "i1", sourceId: "s1" });
    expect(calls[14].args).toEqual({
      items: [{ itemId: "i1", present: true, verified: true }],
      ready: true,
    });
    expect(calls[15].args).toEqual({ folder: "D:/anime", itemId: "i1" });
    expect(calls[16].args).toEqual({
      isPlaying: true,
      mediaId: "m",
      position: 12.5,
      rate: 1,
    });
    expect(calls[17].args).toEqual({ mediaId: "i1", timePos: 12.5 });
    expect(calls[18].args).toEqual({ offsetMs: -250 });
    expect(calls[20].args).toEqual({ itemId: "i1" });
    expect(calls[21].args).toEqual({ peerId: "p2", role: "moderator" });
    expect(calls[22].args).toEqual({
      anilistUserId: null,
      displayName: "Alice",
      peerId: "p2",
    });
    expect(calls[23].args).toEqual({ paths: { i1: "D:/anime/mine.mkv" } });
  });

  it("maps probe to session_probe with the endpoint id and direct paths", async () => {
    const { calls, transport } = fakeTransport(() => ({ online: true, rttMs: 12 }));
    const api = new SessionApi({ transport });

    const probe = await api.probe("ep-1", ["10.0.0.1:443", "10.0.0.2:443"]);

    expect(calls[0]).toEqual({
      command: "session_probe",
      args: { addrs: ["10.0.0.1:443", "10.0.0.2:443"], endpointId: "ep-1" },
    });
    expect(probe).toEqual({ online: true, rttMs: 12 });
  });

  it("probes without direct paths by default", async () => {
    const { calls, transport } = fakeTransport(() => ({ online: false, rttMs: null }));
    const api = new SessionApi({ transport });

    await api.probe("ep-1");

    expect(calls[0].args).toEqual({ addrs: [], endpointId: "ep-1" });
  });

  it("defaults the anilist user id to null and passes an explicit id", async () => {
    const { calls, transport } = fakeTransport(() => ({}));
    const api = new SessionApi({ transport });

    await api.join(TICKET, "Bob", 7);

    expect(calls[0].args).toEqual({
      anilistUserId: 7,
      displayName: "Bob",
      peerId: null,
      ticket: TICKET,
    });
  });

  it("maps pin and react to the room pin/reaction commands", async () => {
    const { calls, transport } = fakeTransport(() => ({}));
    const api = new SessionApi({ transport });

    await api.pin("m1");
    await api.pin(null);
    await api.react({ add: true, emoji: "👍", messageId: "m1" });
    await api.react({ add: false, emoji: "👍", messageId: "m1" });

    expect(calls).toEqual([
      { args: { messageId: "m1" }, command: "session_pin" },
      { args: { messageId: null }, command: "session_pin" },
      {
        args: { add: true, emoji: "👍", messageId: "m1" },
        command: "session_react",
      },
      {
        args: { add: false, emoji: "👍", messageId: "m1" },
        command: "session_react",
      },
    ]);
  });

  it("sends a .torrent attachment with the chat line and fetches it back", async () => {
    const { calls, transport } = fakeTransport(() => ({ name: "x.torrent", bytes: [1, 2] }));
    const api = new SessionApi({ transport });

    await api.chat("cap", "c1", null, { bytes: [1, 2], name: "x.torrent" });
    await api.chatAttachment("m9");

    expect(calls[0].command).toBe("session_chat");
    expect(calls[0].args).toEqual({
      fileBytes: [1, 2],
      fileName: "x.torrent",
      id: "c1",
      links: [],
      replyTo: null,
      text: "cap",
    });
    expect(calls[1].command).toBe("session_chat_attachment");
    expect(calls[1].args).toEqual({ messageId: "m9" });
  });
});
