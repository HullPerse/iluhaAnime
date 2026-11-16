import { afterEach, describe, expect, it, vi } from "vitest";
import { streamApi } from "@/api/stream.api";
import { rememberStreamPrefs } from "@/lib/player/streamPreferences.utils";
import { emptyPrefs } from "@/lib/player/streamPrefs.utils";
import type { StreamOpen } from "@/types/player/videoPlayer";

const session: StreamOpen = {
  sourceId: "s",
  sourceName: "S",
  mediaId: "1",
  mediaTitle: "T",
  episodeId: "1",
  episodeNumber: 1,
  episodeTitle: "",
  watchKey: "watch",
  headers: {},
  quality: "720p",
  variantId: "v",
  sources: [],
  mediaUrl: "https://example.com/video",
};
afterEach(() => vi.restoreAllMocks());

describe("stream preference patches", () => {
  it("preserves both concurrent patches for the same title", async () => {
    let stored = emptyPrefs("s", "1");
    vi.spyOn(streamApi, "prefsGet").mockImplementation(async () => ({ ...stored }));
    vi.spyOn(streamApi, "prefsSave").mockImplementation(async (next) => {
      stored = next;
    });
    await Promise.all([
      rememberStreamPrefs(session, { quality: "1080p" }),
      rememberStreamPrefs(session, { subLang: "ru" }),
    ]);
    expect(stored).toMatchObject({ quality: "1080p", subLang: "ru" });
  });

  it("does not replace preferences with defaults after a failed read", async () => {
    vi.spyOn(streamApi, "prefsGet").mockRejectedValue(new Error("storage unavailable"));
    const save = vi.spyOn(streamApi, "prefsSave").mockResolvedValue();
    await rememberStreamPrefs(session, { quality: "1080p" });
    expect(save).not.toHaveBeenCalled();
  });
});
