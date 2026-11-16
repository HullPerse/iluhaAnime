import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { streamApi } from "@/api/stream.api";
import { usePlayerTracks } from "@/hooks/player/tracks.hook";
import { selectTrack } from "@/lib/player/playback.utils";
import { emptyPrefs } from "@/lib/player/streamPrefs.utils";
import { getMediaEntry } from "@/store/media.store";
import { playbackAtoms, streamSession } from "@/store/player.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

vi.mock("@/lib/player/playback.utils", () => ({
  selectTrack: vi.fn(async () => undefined),
  addExternalAudio: vi.fn(),
  addExternalSubtitle: vi.fn(),
}));

beforeEach(() => {
  playbackAtoms.path.set("/track-test.mkv");
  playbackAtoms.tracks.set([
    { id: 1, type: "audio", lang: "ja", selected: true },
    { id: 1, type: "sub", lang: "ru", selected: false },
  ]);
  streamSession.set(null);
  vi.mocked(selectTrack).mockResolvedValue();
});
afterEach(() => {
  cleanup();
  streamSession.set(null);
  vi.restoreAllMocks();
});

describe("track selection ownership", () => {
  it("persists the subtitle language when audio and subtitle IDs overlap", async () => {
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
    streamSession.set(session);
    vi.spyOn(streamApi, "prefsGet").mockResolvedValue(emptyPrefs("source", "1"));
    const saved = vi.spyOn(streamApi, "prefsSave").mockResolvedValue();
    const { result } = renderHook(() => usePlayerTracks());
    await act(async () => {
      await result.current.onSelectTrack("sub")(1);
    });
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ subLang: "ru", subEnabled: true }),
      ["subLang", "subEnabled"]
    );
  });

  it("does not restore the previous file's tracks when its command fails late", async () => {
    let rejectCommand!: (error: Error) => void;
    vi.mocked(selectTrack).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCommand = reject;
        })
    );
    const { result } = renderHook(() => usePlayerTracks());
    const pending = result.current.onSelectTrack("sub")(1);
    const next = [{ id: 8, type: "audio" as const, selected: true }];
    playbackAtoms.path.set("/new-track-test.mkv");
    playbackAtoms.tracks.set(next);
    await act(async () => {
      rejectCommand(new Error("old command failed"));
      await pending;
    });
    expect(playbackAtoms.tracks.get()).toEqual(next);
    expect(getMediaEntry("/track-test.mkv")).toBeUndefined();
  });

  it("remembers a confirmed disabled subtitle choice for a local file", async () => {
    playbackAtoms.path.set("/disabled-track-test.mkv");
    const { result } = renderHook(() => usePlayerTracks());
    await act(async () => {
      await result.current.onSelectTrack("sub")("no");
    });
    expect(getMediaEntry("/disabled-track-test.mkv")?.subtitleTrack).toBe("no");
  });
});
