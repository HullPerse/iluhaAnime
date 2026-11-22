import { beforeEach, describe, expect, it, vi } from "vitest";

import { addStreamSubtitle } from "@/lib/player/playback.utils";
import { loadStreamSubtitles } from "@/lib/player/streamSubtitles.utils";
import type { StreamOpen } from "@/types/player/videoPlayer";

vi.mock("@/lib/player/playback.utils", () => ({
  addStreamSubtitle: vi.fn(),
}));

function session(overrides: Partial<StreamOpen> = {}): StreamOpen {
  return {
    sourceId: "allanime",
    sourceName: "AllAnime",
    mediaId: "allanime:abc",
    mediaTitle: "Frieren",
    episodeId: "allanime:abc|1",
    episodeNumber: 1,
    episodeTitle: "",
    watchKey: "stream:allanime:abc:1",
    headers: {},
    quality: "1080p",
    variantId: "AllAnime:sub:Default",
    sources: [],
    subtitles: [
      {
        id: "en",
        url: "https://cdn.example/en.vtt",
        language: "English",
        isDefault: true,
        headers: {},
      },
      {
        id: "de",
        url: "https://cdn.example/de.vtt",
        language: "German",
        isDefault: false,
        headers: {},
      },
    ],
    mediaUrl: "https://cdn.example/master.m3u8",
    ...overrides,
  };
}

describe("loadStreamSubtitles", () => {
  beforeEach(() => {
    vi.mocked(addStreamSubtitle).mockClear();
  });

  it("selects the default track and adds the rest inactive", async () => {
    await loadStreamSubtitles(session());

    expect(addStreamSubtitle).toHaveBeenNthCalledWith(
      1,
      "https://cdn.example/en.vtt",
      "English",
      true,
      "https://cdn.example/master.m3u8"
    );
    expect(addStreamSubtitle).toHaveBeenNthCalledWith(
      2,
      "https://cdn.example/de.vtt",
      "German",
      false,
      "https://cdn.example/master.m3u8"
    );
  });

  it("selects the first track when the source marks no default", async () => {
    const subtitles = session().subtitles?.map((track) => ({ ...track, isDefault: false }));

    await loadStreamSubtitles(session({ subtitles }));

    expect(addStreamSubtitle).toHaveBeenNthCalledWith(
      1,
      "https://cdn.example/en.vtt",
      "English",
      true,
      "https://cdn.example/master.m3u8"
    );
    expect(addStreamSubtitle).toHaveBeenNthCalledWith(
      2,
      "https://cdn.example/de.vtt",
      "German",
      false,
      "https://cdn.example/master.m3u8"
    );
  });

  it("does not touch a session that is already stale", async () => {
    await loadStreamSubtitles(session(), () => false);

    expect(addStreamSubtitle).not.toHaveBeenCalled();
  });
});
