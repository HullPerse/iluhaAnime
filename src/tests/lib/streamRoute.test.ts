import { describe, expect, test } from "vitest";

import {
  alternateProxyUrl,
  streamRetryPosition,
  streamRouteKey,
} from "@/lib/player/streamRoute.utils";
import type { StreamOpen } from "@/types/player/videoPlayer";

const proxy = "socks5://127.0.0.1:10808";

function session(patch: Partial<StreamOpen> = {}): StreamOpen {
  return {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: "246",
    mediaTitle: "Bleach",
    episodeId: "455",
    episodeNumber: 3,
    episodeTitle: "",
    watchKey: "stream:animelib:246:455",
    headers: {},
    quality: "720p",
    variantId: "Kodik:32412",
    sources: [],
    mediaUrl: "https://cdn/720.mp4:hls:manifest.m3u8",
    ...patch,
  };
}

describe("alternateProxyUrl", () => {
  test("a direct Kodik stream falls back to the configured proxy", () => {
    expect(alternateProxyUrl(null, proxy)).toBe(proxy);
    expect(alternateProxyUrl(undefined, proxy)).toBe(proxy);
  });

  test("a proxied stream falls back to the direct route", () => {
    // A dead VPN is exactly when the other route saves the episode.
    expect(alternateProxyUrl(proxy, proxy)).toBeNull();
  });

  test("no proxy configured leaves no second route", () => {
    expect(alternateProxyUrl(null, null)).toBeUndefined();
    expect(alternateProxyUrl(proxy, "   ")).toBeUndefined();
  });
});

describe("streamRouteKey", () => {
  test("keeps one budget per logical stream", () => {
    const base = streamRouteKey(session());
    expect(streamRouteKey(session({ proxyUrl: proxy }))).toBe(base);
    expect(streamRouteKey(session({ quality: "480p" }))).not.toBe(base);
    expect(streamRouteKey(session({ variantId: "Kodik:1" }))).not.toBe(base);
  });
});

describe("streamRetryPosition", () => {
  test("prefers the live position over the requested resume", () => {
    expect(streamRetryPosition(session({ resume: 10 }), 42.5)).toBe(42.5);
  });

  test("falls back to the session resume and ignores a fresh start", () => {
    expect(streamRetryPosition(session({ resume: 10 }), 0)).toBe(10);
    expect(streamRetryPosition(session(), 0)).toBeUndefined();
    expect(streamRetryPosition(session({ resume: 0.4 }), Number.NaN)).toBeUndefined();
  });
});
