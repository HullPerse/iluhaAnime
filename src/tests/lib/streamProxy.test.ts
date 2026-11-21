import { describe, expect, test } from "vitest";

import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";

describe("playbackProxyUrl", () => {
  const proxy = "socks5://127.0.0.1:10808";

  test("a Kodik voice-over plays from its CDN without the catalog proxy", () => {
    expect(playbackProxyUrl("Kodik:32412", proxy)).toBeNull();
    expect(playbackProxyUrl("Kodik:32412", null)).toBeNull();
  });

  test("every other player keeps the configured proxy", () => {
    expect(playbackProxyUrl("Animelib:851", proxy)).toBe(proxy);
    expect(playbackProxyUrl("Kodik", proxy)).toBe(proxy);
    expect(playbackProxyUrl("Animelib:851", null)).toBeNull();
  });
});
