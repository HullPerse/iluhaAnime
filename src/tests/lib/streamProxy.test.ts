import { describe, expect, test } from "vitest";

import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";

describe("playbackProxyUrl", () => {
  const proxy = "socks5://127.0.0.1:10808";

  test("a Kodik voice-over plays from its CDN without the catalog proxy", () => {
    // One Kodik HLS segment is ~2.8 MB: through the AnimeLib proxy it took
    // ~17 s at ~170 KB/s against ~0.8 s direct, which is what made a
    // voice-over switch look stuck on the previous track.
    expect(playbackProxyUrl("Kodik:32412", proxy)).toBeNull();
    expect(playbackProxyUrl("Kodik:32412", null)).toBeNull();
  });

  test("every other player keeps the configured proxy", () => {
    expect(playbackProxyUrl("Animelib:851", proxy)).toBe(proxy);
    expect(playbackProxyUrl("Kodik", proxy)).toBe(proxy);
    expect(playbackProxyUrl("Animelib:851", null)).toBeNull();
  });
});
