import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStreamRouteGuard } from "@/hooks/player/streamRoute.hook";
import { streamApi } from "@/api/stream.api";
import { openStream } from "@/lib/player/playback.utils";
import { playbackAtoms, streamSession } from "@/store/player.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

vi.mock("@/lib/player/playback.utils", () => ({ openStream: vi.fn() }));
vi.mock("@/api/stream.api", () => ({ streamApi: { streamSources: vi.fn() } }));

const session: StreamOpen = {
  sourceId: "animelib",
  sourceName: "AnimeLib",
  mediaId: "1",
  mediaTitle: "Title",
  episodeId: "1",
  episodeNumber: 1,
  episodeTitle: "",
  watchKey: "one",
  headers: {},
  quality: "720p",
  variantId: "variant",
  sources: [],
  mediaUrl: "https://example.com/1",
};

afterEach(() => {
  streamSession.set(null);
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("stream route guard", () => {
  it("does not open a refreshed URL after the viewer selects another episode", async () => {
    let finish!: (value: Awaited<ReturnType<typeof streamApi.streamSources>>) => void;
    vi.mocked(streamApi.streamSources).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    streamSession.set(session);
    const { result, rerender } = renderHook(
      ({ current }) =>
        useStreamRouteGuard({ session: current, setLoadingFile: vi.fn(), setFailed: vi.fn() }),
      { initialProps: { current: session } }
    );
    act(() => {
      result.current.retryNow();
    });
    const newer = { ...session, episodeId: "new", mediaUrl: "https://example.com/new" };
    act(() => {
      streamSession.set(newer);
      rerender({ current: newer });
    });
    await act(async () => {
      finish([
        {
          variantId: "variant",
          quality: "720",
          label: "720p",
          type: "mp4",
          url: "https://example.com/stale",
          headers: {},
          subtitles: [],
          audioTracks: [],
        },
      ]);
    });
    expect(openStream).not.toHaveBeenCalled();
    expect(streamSession.get()).toBe(newer);
  });

  it("refreshes an expired URL after the route retry and preserves position and pause", async () => {
    vi.useFakeTimers({ now: 10_000 });
    vi.mocked(openStream).mockResolvedValue();
    vi.mocked(streamApi.streamSources).mockResolvedValue([
      {
        variantId: "variant",
        quality: "720",
        label: "720p",
        type: "mp4",
        url: "https://example.com/fresh",
        headers: { Referer: "https://example.com" },
        subtitles: [],
        audioTracks: [],
      },
    ]);
    playbackAtoms.timePos.set(420);
    playbackAtoms.paused.set(false);
    streamSession.set(session);
    const { result } = renderHook(() =>
      useStreamRouteGuard({ session, setLoadingFile: vi.fn(), setFailed: vi.fn() })
    );
    await act(async () => {
      result.current.failNow();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      result.current.failNow();
    });
    expect(streamApi.streamSources).toHaveBeenCalledWith(
      { episodeId: "1", variantId: "variant", refresh: true },
      "animelib"
    );
    expect(openStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaUrl: "https://example.com/fresh",
        resume: 420,
        paused: false,
        headers: { Referer: "https://example.com" },
      })
    );
    expect(streamSession.get()?.mediaUrl).toBe("https://example.com/fresh");
  });

  it("stops retrying when source refresh fails", async () => {
    vi.useFakeTimers({ now: 10_000 });
    vi.mocked(openStream).mockResolvedValue();
    vi.mocked(streamApi.streamSources).mockRejectedValue(new Error("source unavailable"));
    streamSession.set(session);
    const setLoadingFile = vi.fn();
    const setFailed = vi.fn();
    const { result } = renderHook(() =>
      useStreamRouteGuard({ session, setLoadingFile, setFailed })
    );
    await act(async () => {
      result.current.failNow();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      result.current.failNow();
    });
    expect(setLoadingFile).toHaveBeenLastCalledWith(false);
    expect(setFailed).toHaveBeenLastCalledWith(true);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(streamApi.streamSources).toHaveBeenCalledOnce();
    expect(openStream).toHaveBeenCalledOnce();
  });

  it("updates the active session when its retry succeeds", async () => {
    vi.mocked(openStream).mockResolvedValue();
    streamSession.set(session);
    const { result } = renderHook(() =>
      useStreamRouteGuard({ session, setLoadingFile: vi.fn(), setFailed: vi.fn() })
    );
    await act(async () => {
      result.current.failNow();
      await Promise.resolve();
    });
    expect(openStream).toHaveBeenCalledOnce();
    expect(streamSession.get()).toEqual(vi.mocked(openStream).mock.calls[0]?.[0]);
  });
  it("does not restore the old session when its retry finishes after another selection", async () => {
    let finish!: () => void;
    vi.mocked(openStream).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    streamSession.set(session);
    const { result, rerender } = renderHook(
      ({ current }) =>
        useStreamRouteGuard({ session: current, setLoadingFile: vi.fn(), setFailed: vi.fn() }),
      { initialProps: { current: session } }
    );
    act(() => result.current.failNow());
    const newer = {
      ...session,
      episodeId: "2",
      episodeNumber: 2,
      mediaUrl: "https://example.com/2",
    };
    act(() => {
      streamSession.set(newer);
      rerender({ current: newer });
    });
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(streamSession.get()).toEqual(newer);
  });
});
