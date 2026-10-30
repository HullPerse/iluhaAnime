import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerStream, useStreamNext } from "@/hooks/player/stream.hook";
import { openStream } from "@/lib/playback.utils";
import { streamSession } from "@/store/player.store";
import type { StreamingEpisode, StreamVariant } from "@/types/stream";
import type { StreamOpen, StreamSource } from "@/types/videoPlayer";

const cache = vi.hoisted(() => ({
  loadEpisodes: vi.fn(async (): Promise<StreamingEpisode[]> => []),
  loadPlayers: vi.fn(async (): Promise<StreamVariant[]> => []),
  loadSources: vi.fn(async (): Promise<StreamSource[]> => []),
  prefetchNativeSources: vi.fn(async () => undefined),
}));

vi.mock("@/lib/sessionCache.utils", () => cache);
vi.mock("@/api/stream.api", () => ({
  streamApi: {
    prefsGet: vi.fn(async () => null),
    prefsSave: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/playback.utils", () => ({
  openStream: vi.fn(async () => undefined),
}));

const KODIK: StreamVariant = {
  id: "9",
  name: "Mirror",
  language: "Озвучка",
  separateStream: true,
  player: "Kodik",
  sourceUrl: "",
};

const NATIVE: StreamVariant = {
  id: "9",
  name: "Studio",
  language: "Озвучка",
  separateStream: true,
  player: "Animelib",
  sourceUrl: "",
};

function session(variants?: StreamVariant[]): StreamOpen {
  return {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: "1",
    mediaTitle: "Frieren",
    episodeId: "10",
    episodeNumber: 1,
    episodeTitle: "The journey",
    watchKey: "stream:animelib:1:10",
    headers: {},
    quality: "1080p",
    variantId: "Animelib:9",
    sources: [{ url: "https://cdn/1080.mp4", type: "mp4", quality: "1080", label: "1080p" }],
    variants,
    mediaUrl: "https://cdn/1080.mp4",
  };
}

const EPISODES: StreamingEpisode[] = [
  { id: "10", number: 1, title: "The journey" },
  { id: "11", number: 2, title: "Magic" },
  { id: "12", number: 3 },
];

beforeEach(() => {
  cache.loadPlayers.mockClear();
  cache.loadSources.mockClear();
  cache.prefetchNativeSources.mockClear();
  cache.loadEpisodes.mockResolvedValue([]);
  vi.mocked(openStream).mockClear();
});

afterEach(() => {
  cleanup();
  streamSession.set(null);
});

describe("usePlayerStream", () => {
  it("uses the rows carried by the open request instead of fetching them again", async () => {
    streamSession.set(session([KODIK, NATIVE]));

    const { result } = renderHook(() => usePlayerStream());

    await waitFor(() => expect(result.current.variants).toHaveLength(1));
    expect(result.current.variants[0]).toEqual(NATIVE);
    expect(result.current.variantsLoading).toBe(false);
    expect(cache.loadPlayers).not.toHaveBeenCalled();
    expect(cache.prefetchNativeSources).toHaveBeenCalledWith("10", [NATIVE]);
  });

  it("fetches the rows when the request carries none", async () => {
    cache.loadPlayers.mockResolvedValue([KODIK]);
    streamSession.set(session());

    const { result } = renderHook(() => usePlayerStream());

    await waitFor(() => expect(result.current.variants).toEqual([KODIK]));
    expect(cache.loadPlayers).toHaveBeenCalledWith("10");
  });
});

describe("useStreamNext", () => {
  it("loads the season and reports whether a later episode exists", async () => {
    cache.loadEpisodes.mockResolvedValue(EPISODES);
    streamSession.set({ ...session(), episodeNumber: 3, episodeId: "12" });

    const { result } = renderHook(() => useStreamNext());

    await waitFor(() => expect(result.current.episodes).toHaveLength(3));
    expect(result.current.hasNext).toBe(false);
  });

  it("opens a chosen episode as the same voice-over and quality", async () => {
    cache.loadEpisodes.mockResolvedValue(EPISODES);
    cache.loadSources.mockResolvedValue([
      {
        variantId: "Animelib:9",
        url: "https://cdn/1080.mp4",
        type: "mp4",
        quality: "1080",
        label: "1080p",
        headers: {},
        subtitles: [],
        audioTracks: [],
      },
    ]);
    streamSession.set(session());

    const { result } = renderHook(() => useStreamNext());
    await waitFor(() => expect(result.current.episodes).toHaveLength(3));

    await result.current.goTo(EPISODES[2]);

    expect(openStream).toHaveBeenCalledTimes(1);
    expect(openStream).toHaveBeenCalledWith(expect.objectContaining({ paused: true }));
    expect(streamSession.get()?.episodeId).toBe("12");
    expect(streamSession.get()?.episodeNumber).toBe(3);
    expect(streamSession.get()?.watchKey).toBe("stream:animelib:1:12");
    expect(streamSession.get()?.mediaUrl).toBe("https://cdn/1080.mp4");
  });
});
