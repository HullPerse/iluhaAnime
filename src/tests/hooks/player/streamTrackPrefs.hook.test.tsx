import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { streamApi } from "@/api/stream.api";
import { useStreamTrackPrefs } from "@/hooks/player/streamTrackPrefs.hook";
import { selectTrack } from "@/lib/player/playback.utils";
import { emptyPrefs } from "@/lib/player/streamPrefs.utils";
import type { MpvTrack, StreamOpen } from "@/types/player/videoPlayer";

vi.mock("@/lib/player/playback.utils", () => ({
  selectTrack: vi.fn(async () => undefined),
}));

vi.mock("@/api/stream.api", () => ({
  streamApi: { prefsGet: vi.fn() },
}));

const session: StreamOpen = {
  sourceId: "source",
  sourceName: "Source",
  mediaId: "1",
  mediaTitle: "Title",
  episodeId: "2",
  episodeNumber: 2,
  episodeTitle: "",
  watchKey: "stream:1:2",
  headers: {},
  quality: "720p",
  variantId: "v",
  sources: [],
  mediaUrl: "https://example.com/video",
};

const tracks: MpvTrack[] = [
  { id: 1, type: "audio", lang: "ja", selected: true },
  { id: 2, type: "sub", lang: "ru", selected: false },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("stream track preferences", () => {
  it("applies tracks only when enabled and reports restored", async () => {
    vi.mocked(streamApi.prefsGet).mockResolvedValue({
      ...emptyPrefs("source", "1"),
      audioLang: "ja",
      subLang: "no",
      subEnabled: false,
    });
    const onRestored = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useStreamTrackPrefs(session, tracks, { enabled, onRestored }),
      { initialProps: { enabled: false } }
    );

    expect(selectTrack).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => {
      await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    });

    expect(selectTrack).toHaveBeenNthCalledWith(1, "audio", 1);
    expect(selectTrack).toHaveBeenNthCalledWith(2, "sub", "no");
  });
});
