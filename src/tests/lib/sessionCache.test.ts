import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadEpisodes,
  loadPlayers,
  loadSources,
  prefetchNativeSources,
} from "@/lib/sessionCache.utils";
import type { StreamVariant } from "@/types/stream";

const api = vi.hoisted(() => ({
  players: vi.fn(),
  episodes: vi.fn(),
  streamSources: vi.fn(),
}));

vi.mock("@/api/stream.api", () => ({ streamApi: api }));

function variant(player: string, id: string, name: string): StreamVariant {
  return { id, name, player, separateStream: true, sourceUrl: "" };
}

const TTL_MS = 5 * 60_000;

beforeEach(() => {
  api.players.mockReset();
  api.episodes.mockReset();
  api.streamSources.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stream session cache", () => {
  it("shares one request between concurrent callers", async () => {
    const rows = [variant("Animelib", "1", "Team")];
    api.players.mockResolvedValue(rows);

    const [first, second] = await Promise.all([
      loadPlayers("cache-concurrent"),
      loadPlayers("cache-concurrent"),
    ]);

    expect(api.players).toHaveBeenCalledTimes(1);
    expect(first).toBe(rows);
    expect(second).toBe(rows);
  });

  it("reuses an answer until the TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    api.episodes.mockResolvedValue([]);

    await loadEpisodes("cache-ttl");
    await loadEpisodes("cache-ttl");
    expect(api.episodes).toHaveBeenCalledTimes(1);

    vi.setSystemTime(TTL_MS + 1);
    await loadEpisodes("cache-ttl");
    expect(api.episodes).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    api.players.mockRejectedValueOnce(new Error("network down"));
    await expect(loadPlayers("cache-failure")).rejects.toThrow("network down");

    api.players.mockResolvedValue([]);
    await expect(loadPlayers("cache-failure")).resolves.toEqual([]);
    expect(api.players).toHaveBeenCalledTimes(2);
  });

  it("keys sources by episode and voice-over", async () => {
    api.streamSources.mockResolvedValue([]);

    await loadSources("cache-sources", "Animelib:1");
    await loadSources("cache-sources", "Animelib:2");
    await loadSources("cache-sources", "Animelib:1");

    expect(api.streamSources).toHaveBeenCalledTimes(2);
    expect(api.streamSources).toHaveBeenNthCalledWith(1, {
      episodeId: "cache-sources",
      variantId: "Animelib:1",
    });
  });

  it("prefetches only the site's own rows and survives a failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    api.streamSources.mockRejectedValueOnce(new Error("resolve failed")).mockResolvedValueOnce([]);

    await prefetchNativeSources("cache-prefetch", [
      variant("Kodik", "9", "Kodik only"),
      variant("Animelib", "1", "Native A"),
      variant("Animelib", "2", "Native B"),
    ]);

    expect(api.streamSources).toHaveBeenCalledTimes(2);
    expect(api.streamSources).toHaveBeenNthCalledWith(1, {
      episodeId: "cache-prefetch",
      variantId: "Animelib:1",
    });
    expect(api.streamSources).toHaveBeenNthCalledWith(2, {
      episodeId: "cache-prefetch",
      variantId: "Animelib:2",
    });
  });

  it("stops prefetching when the caller cancels", async () => {
    await prefetchNativeSources(
      "cache-cancelled",
      [variant("Animelib", "1", "Native A"), variant("Animelib", "2", "Native B")],
      () => true
    );

    expect(api.streamSources).not.toHaveBeenCalled();
  });
});
