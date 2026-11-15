import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStreamRouteGuard } from "@/hooks/player/streamRoute.hook";
import { openStream } from "@/lib/player/playback.utils";
import { streamSession } from "@/store/player.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

vi.mock("@/lib/player/playback.utils", () => ({ openStream: vi.fn() }));

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
});

describe("stream route guard", () => {
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
