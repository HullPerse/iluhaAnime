import { beforeEach, describe, expect, it, vi } from "vitest";

const { warm } = vi.hoisted(() => ({ warm: vi.fn(async () => undefined) }));

vi.mock("@/api/stream.api", () => ({ streamApi: { warm } }));

import { resetStreamWarmCache, warmStreamUrl } from "@/lib/player/streamWarm.utils";

beforeEach(() => {
  warm.mockClear();
  resetStreamWarmCache();
  vi.useRealTimers();
});

describe("warmStreamUrl", () => {
  it("asks for the same URL and route only once", async () => {
    const headers = { Referer: "https://animelib.org/" };

    await warmStreamUrl("https://cdn.example/720.m3u8", headers, null);
    await warmStreamUrl("https://cdn.example/720.m3u8", headers, null);

    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledWith("https://cdn.example/720.m3u8", headers, null);
  });

  it("keeps the direct and the proxied route separate", async () => {
    await warmStreamUrl("https://cdn.example/720.m3u8", {}, null);
    await warmStreamUrl("https://cdn.example/720.m3u8", {}, "socks5://127.0.0.1:10808");

    expect(warm).toHaveBeenCalledTimes(2);
  });

  it("ignores anything that is not an http source", async () => {
    await warmStreamUrl("file:///C:/video.mp4", {}, null);
    await warmStreamUrl("   ", {}, null);

    expect(warm).not.toHaveBeenCalled();
  });

  it("warms again after the short memory expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    await warmStreamUrl("https://cdn.example/720.m3u8", {}, null);

    vi.setSystemTime(1_000 + 2 * 60_000 + 1);
    await warmStreamUrl("https://cdn.example/720.m3u8", {}, null);

    expect(warm).toHaveBeenCalledTimes(2);
  });

  it("bounds the hover memory", async () => {
    for (let index = 0; index < 30; index += 1) {
      await warmStreamUrl(`https://cdn.example/${index}.m3u8`, {}, null);
    }

    // The oldest entry was evicted, so it is worth warming again.
    await warmStreamUrl("https://cdn.example/0.m3u8", {}, null);

    expect(warm).toHaveBeenCalledTimes(31);
  });
});
