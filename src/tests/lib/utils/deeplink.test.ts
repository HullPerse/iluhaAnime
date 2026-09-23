import { describe, expect, it } from "vitest";

import {
  buildAnimeLink,
  buildTorrentLink,
  ingestDeepLinks,
  isEditablePasteTarget,
  parseAnilistPageUrl,
  parseAnimeLink,
  parseAnilistAuthCallback,
  parsePastedLink,
  parseTorrentLink,
} from "@/lib/utils/deeplink.utils";
import type { AnimeDeepLink } from "@/lib/utils/deeplink.utils";

describe("buildAnimeLink", () => {
  it("builds the exact anilist shape", () => {
    expect(buildAnimeLink(21)).toBe("iluhaanime://anime/anilist/21");
  });
});

describe("parseAnimeLink", () => {
  it("parses a valid link", () => {
    expect(parseAnimeLink("iluhaanime://anime/anilist/21")).toEqual({
      source: "anilist",
      id: 21,
    });
  });

  it("accepts an uppercase scheme", () => {
    expect(parseAnimeLink("ILUHAANIME://anime/anilist/21")?.id).toBe(21);
  });

  it("rejects foreign schemes and lookalikes", () => {
    expect(parseAnimeLink("https://anilist.co/anime/21")).toBeNull();
    expect(parseAnimeLink("xiluhaanime://anime/anilist/21")).toBeNull();
    expect(parseAnimeLink("iluhaanime2://anime/anilist/21")).toBeNull();
  });

  it("rejects wrong shape", () => {
    expect(parseAnimeLink("iluhaanime://anime/collection/abc")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/21/extra")).toBeNull();
  });

  it("rejects bad ids", () => {
    expect(parseAnimeLink("iluhaanime://anime/anilist/0")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/-5")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/12a")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/12345678901")).toBeNull();
  });

  it("trims surrounding whitespace and leading zeros", () => {
    expect(parseAnimeLink("  iluhaanime://anime/anilist/21  ")?.id).toBe(21);
    expect(parseAnimeLink("iluhaanime://anime/anilist/007")?.id).toBe(7);
    expect(parseAnimeLink("iluhaanime://anime/anilist/1234567890")?.id).toBe(1234567890);
  });

  it("rejects query strings and fragments", () => {
    expect(parseAnimeLink("iluhaanime://anime/anilist/21?x=1")).toBeNull();
    expect(parseAnimeLink("iluhaanime://anime/anilist/21#frag")).toBeNull();
  });

  it("rejects empty and blank input", () => {
    expect(parseAnimeLink("")).toBeNull();
    expect(parseAnimeLink("   ")).toBeNull();
  });

  it("round-trips through the builder", () => {
    expect(parseAnimeLink(buildAnimeLink(5114))).toEqual({ source: "anilist", id: 5114 });
  });
});

describe("ingestDeepLinks", () => {
  function setup() {
    const opened: AnimeDeepLink[] = [];
    let invalid = 0;
    const run = (urls: unknown) =>
      ingestDeepLinks(
        urls,
        (link) => {
          opened.push(link);
        },
        () => {
          invalid += 1;
        }
      );
    return { opened, run, invalidCalls: () => invalid };
  }

  it("opens every valid link without flagging", () => {
    const s = setup();
    s.run(["iluhaanime://anime/anilist/21", buildAnimeLink(5114)]);
    expect(s.opened).toEqual([
      { source: "anilist", id: 21 },
      { source: "anilist", id: 5114 },
    ]);
    expect(s.invalidCalls()).toBe(0);
  });

  it("ignores non-array payloads silently", () => {
    const s = setup();
    s.run(null);
    s.run("iluhaanime://anime/anilist/21");
    expect(s.opened).toEqual([]);
    expect(s.invalidCalls()).toBe(0);
  });

  it("flags once for mixed bad entries and keeps the good ones", () => {
    const s = setup();
    s.run(["iluhaanime://anime/anilist/21", "https://evil.example/x", 42, "iluhaanime://nope"]);
    expect(s.opened).toEqual([{ source: "anilist", id: 21 }]);
    expect(s.invalidCalls()).toBe(1);
  });

  it("flags an all-bad batch once", () => {
    const s = setup();
    s.run(["junk", 7]);
    expect(s.opened).toEqual([]);
    expect(s.invalidCalls()).toBe(1);
  });
});

describe("parseAnilistAuthCallback", () => {
  it("reads the token from the fragment", () => {
    expect(
      parseAnilistAuthCallback("iluhaanime://auth/anilist#access_token=abc123&token_type=bearer")
    ).toEqual({ accessToken: "abc123" });
  });

  it("falls back to the query string", () => {
    expect(parseAnilistAuthCallback("iluhaanime://auth/anilist?access_token=abc123")).toEqual({
      accessToken: "abc123",
    });
  });

  it("accepts an uppercase scheme and surrounding whitespace", () => {
    expect(parseAnilistAuthCallback("  ILUHAANIME://auth/anilist#access_token=abc123  ")).toEqual({
      accessToken: "abc123",
    });
  });

  it("rejects foreign schemes, wrong paths and extra segments", () => {
    expect(parseAnilistAuthCallback("https://anilist.co")).toBeNull();
    expect(parseAnilistAuthCallback("iluhaanime://anime/anilist/21")).toBeNull();
    expect(parseAnilistAuthCallback("iluhaanime://auth/anilist/extra#access_token=x")).toBeNull();
    expect(parseAnilistAuthCallback("iluhaanime://auth/other#access_token=x")).toBeNull();
  });

  it("rejects missing, blank and overlong tokens", () => {
    expect(parseAnilistAuthCallback("iluhaanime://auth/anilist")).toBeNull();
    expect(parseAnilistAuthCallback("iluhaanime://auth/anilist#token_type=bearer")).toBeNull();
    expect(parseAnilistAuthCallback("iluhaanime://auth/anilist#access_token=%20%20")).toBeNull();
    expect(
      parseAnilistAuthCallback(`iluhaanime://auth/anilist#access_token=${"a".repeat(4097)}`)
    ).toBeNull();
  });

  it("routes the callback through ingest without flagging", () => {
    const authed: string[] = [];
    let invalid = 0;
    ingestDeepLinks(
      ["iluhaanime://auth/anilist#access_token=abc123"],
      () => {},
      () => {
        invalid += 1;
      },
      undefined,
      undefined,
      (link) => {
        authed.push(link.accessToken);
      }
    );
    expect(authed).toEqual(["abc123"]);
    expect(invalid).toBe(0);
  });

  it("flags the callback when no auth handler is wired", () => {
    let invalid = 0;
    ingestDeepLinks(
      ["iluhaanime://auth/anilist#access_token=abc123"],
      () => {},
      () => {
        invalid += 1;
      }
    );
    expect(invalid).toBe(1);
  });
});

describe("parseTorrentLink", () => {
  it("parses a valid link and lowercases the hash", () => {
    expect(
      parseTorrentLink("iluhaanime://torrent/ABCDEF0123456789ABCDEF0123456789ABCDEF01")
    ).toEqual({ infoHash: "abcdef0123456789abcdef0123456789abcdef01" });
  });

  it("rejects wrong shape", () => {
    expect(parseTorrentLink("iluhaanime://anime/anilist/21")).toBeNull();
    expect(parseTorrentLink("iluhaanime://torrent/")).toBeNull();
    expect(parseTorrentLink("iluhaanime://torrent/abc")).toBeNull();
    expect(
      parseTorrentLink("iluhaanime://torrent/xyzXYZ0123456789xyzXYZ0123456789xyzXYZ01")
    ).toBeNull();
    expect(
      parseTorrentLink("iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01?x=1")
    ).toBeNull();
  });

  it("round-trips through the builder", () => {
    const hash = "abcdef0123456789abcdef0123456789abcdef01";
    expect(parseTorrentLink(buildTorrentLink(hash))).toEqual({ infoHash: hash });
  });

  it("routes torrent links to the torrent opener", () => {
    const openedAnime: AnimeDeepLink[] = [];
    const openedTorrents: { infoHash: string }[] = [];
    let invalid = 0;
    ingestDeepLinks(
      ["iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01"],
      (link) => {
        openedAnime.push(link);
      },
      () => {
        invalid += 1;
      },
      (link) => {
        openedTorrents.push(link);
      }
    );
    expect(openedAnime).toEqual([]);
    expect(openedTorrents).toEqual([{ infoHash: "abcdef0123456789abcdef0123456789abcdef01" }]);
    expect(invalid).toBe(0);
  });

  it("flags torrent links without a torrent opener", () => {
    let invalid = 0;
    ingestDeepLinks(
      ["iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01"],
      () => {},
      () => {
        invalid += 1;
      }
    );
    expect(invalid).toBe(1);
  });
});

describe("parsePastedLink", () => {
  it("routes both link kinds", () => {
    expect(parsePastedLink("iluhaanime://anime/anilist/21")).toEqual({
      kind: "anime",
      link: { source: "anilist", id: 21 },
    });
    expect(
      parsePastedLink("iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01")
    ).toEqual({
      kind: "torrent",
      link: { infoHash: "abcdef0123456789abcdef0123456789abcdef01" },
    });
  });

  it("ignores non-link text silently", () => {
    expect(parsePastedLink("just some text")).toBeNull();
    expect(parsePastedLink("")).toBeNull();
    expect(parsePastedLink("https://evil.example/anime/21")).toBeNull();
  });

  it("routes magnets to the magnet kind", () => {
    expect(parsePastedLink("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01")).toEqual(
      {
        kind: "magnet",
        magnet: "magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      }
    );
  });

  it("routes collection share links to the share kind", () => {
    expect(parsePastedLink("iluhaanime://collection/share/abcDEF123-_")).toEqual({
      kind: "collectionShare",
    });
  });

  it("routes anilist page urls to the anime kind", () => {
    expect(parsePastedLink("https://anilist.co/anime/21/One-Piece")).toEqual({
      kind: "anime",
      link: { source: "anilist", id: 21 },
    });
  });

  it("flags scheme garbage as invalid", () => {
    expect(parsePastedLink("iluhaanime://nope")).toBe("invalid");
  });
});

describe("parseAnilistPageUrl", () => {
  it("parses a bare anime page url", () => {
    expect(parseAnilistPageUrl("https://anilist.co/anime/21")).toEqual({
      source: "anilist",
      id: 21,
    });
  });

  it("accepts a slug and a trailing slash", () => {
    expect(parseAnilistPageUrl("https://anilist.co/anime/21/One-Piece")?.id).toBe(21);
    expect(parseAnilistPageUrl("https://anilist.co/anime/21/")?.id).toBe(21);
  });

  it("accepts an uppercase scheme and host", () => {
    expect(parseAnilistPageUrl("HTTPS://ANILIST.CO/anime/21")?.id).toBe(21);
  });

  it("rejects manga paths, bad ids, and query strings", () => {
    expect(parseAnilistPageUrl("https://anilist.co/manga/21")).toBeNull();
    expect(parseAnilistPageUrl("https://anilist.co/anime/0")).toBeNull();
    expect(parseAnilistPageUrl("https://anilist.co/anime/")).toBeNull();
    expect(parseAnilistPageUrl("https://anilist.co/anime/21?ref=home")).toBeNull();
    expect(parseAnilistPageUrl("https://anilist.co/anime/21#frag")).toBeNull();
    expect(parseAnilistPageUrl("http://anilist.co/anime/21")).toBeNull();
    expect(parseAnilistPageUrl("https://www.anilist.co/anime/21")).toBeNull();
    expect(parseAnilistPageUrl("https://evil.example/anime/21")).toBeNull();
    expect(parseAnilistPageUrl("watch https://anilist.co/anime/21")).toBeNull();
    expect(parseAnilistPageUrl("")).toBeNull();
  });
});

describe("isEditablePasteTarget", () => {
  it("detects inputs, textareas, and editors", () => {
    expect(isEditablePasteTarget(document.createElement("input"))).toBe(true);
    expect(isEditablePasteTarget(document.createElement("textarea"))).toBe(true);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    expect(isEditablePasteTarget(editor)).toBe(true);
  });

  it("passes buttons and null through", () => {
    expect(isEditablePasteTarget(document.createElement("button"))).toBe(false);
    expect(isEditablePasteTarget(document.createElement("div"))).toBe(false);
    expect(isEditablePasteTarget(null)).toBe(false);
  });
});
