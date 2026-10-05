import { describe, expect, it } from "vitest";

import {
  chatSegments,
  formatChatClock,
  imagePreviewLinks,
  isChatLink,
  isTorrentLink,
  torrentLinkMagnet,
} from "@/lib/session/chat.utils";
import { analyzeCompatibility, itemReports } from "@/lib/session/match.utils";
import {
  isVideoFile,
  joinSavePath,
  pickVerifyFile,
  resolveOnlyFiles,
} from "@/lib/session/download.utils";
import { transferCandidates } from "@/lib/session/peer.utils";
import {
  buildHostMagnet,
  detectSourceKind,
  sourceDisplayText,
  sourceKindKey,
} from "@/lib/session/source.utils";
import {
  formatTicketShare,
  normalizeTicket,
  parseTicket,
  ticketRoomLabel,
} from "@/lib/session/ticket.utils";
import type { PeerInfo, SessionTicket } from "@/types/session";
import type { TorrentFileInfo } from "@/types/torrent";

const TICKET: SessionTicket = {
  sessionId: "a1b2c3d4e5f60718",
  token: "0123456789abcdef0123456789abcdef",
  endpointId: "ab".repeat(32),
};

describe("session/ticket", () => {
  it("round-trips a ticket through its share string", () => {
    const share = formatTicketShare(TICKET);
    expect(share.startsWith("iluhaanime://lobby/")).toBe(true);
    expect(parseTicket(share)).toEqual(TICKET);
  });

  it("accepts a raw JSON ticket", () => {
    expect(parseTicket(JSON.stringify(TICKET))).toEqual(TICKET);
  });

  it("normalizes hex case to lowercase", () => {
    const parsed = parseTicket(
      JSON.stringify({ ...TICKET, sessionId: "A1B2C3D4E5F60718" })
    );
    expect(parsed?.sessionId).toBe(TICKET.sessionId);
  });

  it("rejects a wrong prefix, garbage, and empty input", () => {
    expect(parseTicket("iluhaanime://anime/anilist/1")).toBeNull();
    expect(parseTicket("not a ticket")).toBeNull();
    expect(parseTicket("   ")).toBeNull();
    expect(parseTicket("{not json")).toBeNull();
  });

  it("rejects tickets with a bad endpoint id", () => {
    expect(normalizeTicket({ ...TICKET, endpointId: "short" })).toBeNull();
    expect(normalizeTicket({ ...TICKET, endpointId: "zz".repeat(32) })).toBeNull();
    expect(normalizeTicket({ sessionId: TICKET.sessionId })).toBeNull();
    expect(normalizeTicket(null)).toBeNull();
  });

  it("labels the room from the session id", () => {
    expect(ticketRoomLabel(TICKET)).toBe("A1B2 C3D4");
  });
});

describe("session/chat", () => {
  it("keeps a single word as one text segment", () => {
    expect(chatSegments("hello")).toEqual([{ kind: "text", value: "hello" }]);
  });

  it("splits plain words and whitespace into text segments", () => {
    expect(chatSegments("hello world")).toEqual([
      { kind: "text", value: "hello" },
      { kind: "text", value: " " },
      { kind: "text", value: "world" },
    ]);
  });

  it("marks magnets, deep links, and URLs as links", () => {
    expect(isChatLink("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01")).toBe(
      true
    );
    expect(isChatLink("iluhaanime://anime/anilist/42")).toBe(true);
    expect(isChatLink("https://example.com/watch")).toBe(true);
    expect(isChatLink("hello")).toBe(false);
  });

  it("separates torrent links from plain web links", () => {
    expect(isTorrentLink("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01")).toBe(
      true
    );
    expect(isTorrentLink(`iluhaanime://torrent/${"ab".repeat(20)}`)).toBe(true);
    expect(isTorrentLink("https://example.com/watch")).toBe(false);
    expect(isTorrentLink("iluhaanime://anime/anilist/42")).toBe(false);
    expect(isTorrentLink("hello")).toBe(false);
    // Trailing punctuation belongs to the text, not the token.
    expect(isTorrentLink(`iluhaanime://torrent/${"ab".repeat(20)}.`)).toBe(true);
  });

  it("resolves a torrent link token to its magnet", () => {
    expect(
      torrentLinkMagnet("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01")
    ).toBe("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01");
    expect(torrentLinkMagnet(`iluhaanime://torrent/${"AB".repeat(20)}.`)).toBe(
      `magnet:?xt=urn:btih:${"ab".repeat(20)}`
    );
    expect(torrentLinkMagnet("https://example.com/watch")).toBeNull();
    expect(torrentLinkMagnet("hello")).toBeNull();
  });

  it("splits a line into text and link segments and keeps punctuation", () => {
    const segments = chatSegments("see https://example.com/x now");
    expect(segments).toEqual([
      { kind: "text", value: "see" },
      { kind: "text", value: " " },
      { kind: "link", value: "https://example.com/x" },
      { kind: "text", value: " " },
      { kind: "text", value: "now" },
    ]);
  });

  it("moves trailing punctuation after a link into its own text segment", () => {
    expect(chatSegments("go https://example.com/x.")).toEqual([
      { kind: "text", value: "go" },
      { kind: "text", value: " " },
      { kind: "link", value: "https://example.com/x" },
      { kind: "text", value: "." },
    ]);
  });

  it("marks :iluha_* shortcodes as emoji segments, lowercased", () => {
    expect(chatSegments("hi :iluha_Cat: bye")).toEqual([
      { kind: "text", value: "hi" },
      { kind: "text", value: " " },
      { kind: "emoji", value: "iluha_cat" },
      { kind: "text", value: " " },
      { kind: "text", value: "bye" },
    ]);
  });

  it("keeps foreign or malformed shortcodes as plain text", () => {
    expect(chatSegments(":smile: :iluha_cat :cat:")).toEqual([
      { kind: "text", value: ":smile:" },
      { kind: "text", value: " " },
      { kind: "text", value: ":iluha_cat" },
      { kind: "text", value: " " },
      { kind: "text", value: ":cat:" },
    ]);
    expect(chatSegments(":iluha_cat.")).toEqual([{ kind: "text", value: ":iluha_cat." }]);
  });

  it("marks @name against the roster as a mention segment", () => {
    expect(chatSegments("hi @Alice, look", ["Alice"])).toEqual([
      { kind: "text", value: "hi" },
      { kind: "text", value: " " },
      { kind: "mention", value: "@Alice" },
      { kind: "text", value: "," },
      { kind: "text", value: " " },
      { kind: "text", value: "look" },
    ]);
  });

  it("matches mentions case-insensitively and longest-first", () => {
    const segments = chatSegments("@alice smith hey", ["Al", "Alice Smith"]);
    expect(segments).toEqual([
      { kind: "mention", value: "@alice smith" },
      { kind: "text", value: " " },
      { kind: "text", value: "hey" },
    ]);
  });

  it("ignores @text without a roster match or a word boundary", () => {
    expect(chatSegments("mail@alice.test @bob", ["Alice"])).toEqual([
      { kind: "text", value: "mail@alice.test" },
      { kind: "text", value: " " },
      { kind: "text", value: "@bob" },
    ]);
    // "@Alice" embedded in a longer word stays plain.
    expect(chatSegments("x@Alice y", ["Alice"])).toEqual([
      { kind: "text", value: "x@Alice" },
      { kind: "text", value: " " },
      { kind: "text", value: "y" },
    ]);
    // No roster: everything is plain.
    expect(chatSegments("@Alice")).toEqual([{ kind: "text", value: "@Alice" }]);
  });

  it("collects https image links for embeds, skipping http and non-images", () => {
    const text =
      "look https://cdn.example.com/a.png?w=100 http://plain.example.com/c.png " +
      "https://cdn.example.com/page.html https://cdn.example.com/b.webp " +
      "https://cdn.example.com/a.png?w=100";
    expect(imagePreviewLinks(text)).toEqual([
      "https://cdn.example.com/a.png?w=100",
      "https://cdn.example.com/b.webp",
    ]);
  });

  it("caps image previews at three per message", () => {
    const text = [1, 2, 3, 4].map((n) => `https://e.com/${n}.jpg`).join(" ");
    expect(imagePreviewLinks(text)).toHaveLength(3);
  });

  it("formats a chat clock and guards invalid timestamps", () => {
    expect(formatChatClock(0)).toBe("--:--");
    expect(formatChatClock(Number.NaN)).toBe("--:--");
    expect(formatChatClock(1_700_000_000)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("session/match", () => {
  const host = { duration: 1440, sha256: "a".repeat(64), size: 1 };

  it("prefers an exact hash match and reports no deltas", () => {
    expect(analyzeCompatibility(host, { ...host })).toEqual({
      level: "exact",
      deltas: [],
    });
  });

  it("treats a hash miss within a second as compatible", () => {
    expect(
      analyzeCompatibility(host, {
        duration: 1440.5,
        sha256: "b".repeat(64),
        size: 1,
      }).level
    ).toBe("compatible");
    expect(
      analyzeCompatibility(host, {
        duration: 1439.5,
        sha256: "b".repeat(64),
        size: 1,
      }).level
    ).toBe("compatible");
  });

  it("flags a duration miss as incompatible and lists the differences", () => {
    const report = analyzeCompatibility(host, {
      duration: 1200,
      sha256: "b".repeat(64),
      size: 2,
    });
    expect(report.level).toBe("incompatible");
    expect(report.deltas.map((delta) => delta.field)).toEqual(["size", "duration"]);
  });

  it("flags differing video parameters as risky", () => {
    const codec = "h264";
    const hostVideo = {
      ...host,
      video: { bitrate: 1, codec, fps: 24, height: 1080, width: 1920 },
    };
    const local = {
      ...host,
      sha256: "b".repeat(64),
      video: { ...hostVideo.video, codec: "hevc" },
    };
    const report = analyzeCompatibility(hostVideo, local);
    expect(report.level).toBe("risky");
    expect(report.deltas.map((delta) => delta.field)).toContain("codec");
  });

  it("reports per-item presence from the match table", () => {
    const plan = [
      { identity: host, itemId: "a", order: 0, sources: [], title: "A" },
      {
        identity: { duration: 10, sha256: "c".repeat(64), size: 1 },
        itemId: "b",
        order: 1,
        sources: [],
        title: "B",
      },
    ];
    expect(itemReports(plan, { a: "exact" })).toEqual([
      { itemId: "a", present: true, verified: true },
      { itemId: "b", present: false, verified: false },
    ]);
    expect(itemReports(plan, { a: "compatible", b: "incompatible" })).toEqual([
      { itemId: "a", present: true, verified: false },
      { itemId: "b", present: false, verified: false },
    ]);
  });
});

describe("session/source", () => {
  it("detects the source kind from its value", () => {
    expect(detectSourceKind("magnet:?xt=urn:btih:X")).toBe("magnet");
    expect(detectSourceKind(`iluhaanime://torrent/${"a".repeat(40)}`)).toBe(
      "deepLink"
    );
    expect(detectSourceKind("D:/anime/x.torrent")).toBe("torrent");
    expect(detectSourceKind("D:/anime/x.mkv")).toBe("file");
  });

  it("maps each kind to a label key", () => {
    expect(sourceKindKey("file")).toBe("lobby.playlist.source.file");
    expect(sourceKindKey("hostSeeded")).toBe("lobby.playlist.source.hostTorrent");
  });

  it("builds a host magnet with a lowercased hash and an encoded name", () => {
    expect(buildHostMagnet("ABCDEF01", "Ep 1")).toBe(
      "magnet:?xt=urn:btih:abcdef01&dn=Ep%201"
    );
    expect(buildHostMagnet("ABCDEF01", "  ")).toBe(
      "magnet:?xt=urn:btih:abcdef01"
    );
  });

  it("prefers the label, then the value, then nothing", () => {
    expect(
      sourceDisplayText({
        kind: "file",
        label: "Ep 1",
        sourceId: "s",
        status: "ready",
        value: "p",
      })
    ).toBe("Ep 1");
    expect(
      sourceDisplayText({
        kind: "file",
        label: null,
        sourceId: "s",
        status: "ready",
        value: "p",
      })
    ).toBe("p");
    expect(
      sourceDisplayText({
        kind: "file",
        label: null,
        sourceId: "s",
        status: "ready",
        value: null,
      })
    ).toBeNull();
  });
});

describe("session/peer", () => {
  const peer = (
    peerId: string,
    role: "host" | "moderator" | "viewer"
  ): PeerInfo => ({
    anilistUserId: null,
    avatarSeed: peerId,
    buffering: false,
    connection: "direct",
    displayName: peerId,
    driftMs: 0,
    endpointId: `end-${peerId}`,
    left: false,
    peerId,
    ready: true,
    role,
    rttMs: 0,
  });

  it("ranks moderators above viewers regardless of roster order", () => {
    const picked = transferCandidates([
      peer("p3", "viewer"),
      peer("p2", "moderator"),
      peer("p1", "host"),
      peer("p4", "viewer"),
      peer("p5", "moderator"),
    ]);
    expect(picked.map((p) => p.peerId)).toEqual(["p2", "p5", "p3", "p4"]);
  });

  it("excludes the host from the candidate list", () => {
    expect(transferCandidates([peer("p1", "host")])).toEqual([]);
  });

  it("breaks same-rank ties by peer id so the default is deterministic", () => {
    const first = transferCandidates([peer("pb", "viewer"), peer("pa", "viewer")]);
    const second = transferCandidates([peer("pa", "viewer"), peer("pb", "viewer")]);
    expect(first.map((p) => p.peerId)).toEqual(["pa", "pb"]);
    expect(second.map((p) => p.peerId)).toEqual(["pa", "pb"]);
  });
});

describe("session/download", () => {
  const EXTENSIONS = ["mp4", "mkv", "avi"];
  const file = (
    index: number,
    name: string,
    size: number,
    selected = true
  ): TorrentFileInfo => ({
    completed: true,
    exists: true,
    index,
    name,
    priority: "normal",
    progress_bytes: size,
    selected,
    size,
  });

  it("joins the save dir, sub-folder, and torrent-relative name", () => {
    expect(joinSavePath("D:/dl", null, "Show/Ep01.mkv")).toBe("D:/dl/Show/Ep01.mkv");
    expect(joinSavePath("D:/dl/", "Season 1", "Ep01.mkv")).toBe(
      "D:/dl/Season 1/Ep01.mkv"
    );
  });

  it("matches video extensions with or without a leading dot", () => {
    expect(isVideoFile("Ep01.MKV", EXTENSIONS)).toBe(true);
    expect(isVideoFile("notes.txt", EXTENSIONS)).toBe(false);
    expect(isVideoFile("clip.mp4", [".mp4"])).toBe(true);
  });

  it("prefers the byte-size match over the largest video", () => {
    const files = [
      file(0, "Show/Ep01.mkv", 100),
      file(1, "Show/Ep02.mkv", 300),
      file(2, "Show/extra.mp4", 900),
    ];
    expect(pickVerifyFile(files, 300, EXTENSIONS, null)?.index).toBe(1);
  });

  it("falls back to the largest video without a size match", () => {
    const files = [file(0, "Show/Ep01.mkv", 100), file(1, "Show/Ep02.mkv", 300)];
    expect(pickVerifyFile(files, 999, EXTENSIONS, null)?.index).toBe(1);
  });

  it("stays inside the download selection and skips non-video files", () => {
    const files = [
      file(0, "Show/Ep01.mkv", 300, false),
      file(1, "Show/Ep02.mkv", 300),
      file(2, "Show/cover.jpg", 50),
    ];
    expect(pickVerifyFile(files, 300, EXTENSIONS, [1, 2])?.index).toBe(1);
    expect(pickVerifyFile(files, 50, EXTENSIONS, [1, 2])?.index).toBe(1);
  });

  it("returns null when there is nothing to check", () => {
    expect(pickVerifyFile([], 10, EXTENSIONS, null)).toBeNull();
  });

  it("lifts the restriction only when everything is selected", () => {
    const all = [{ index: 0 }, { index: 1 }];
    expect(resolveOnlyFiles(all, [0, 1])).toBeNull();
    expect(resolveOnlyFiles(all, [1])).toEqual([1]);
  });
});
