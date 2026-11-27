import { describe, expect, it } from "vitest";

import {
  preferredLanguageTrackId,
  resolveTrackId,
  trackIdentity,
} from "@/lib/player/trackIdentity.utils";
import type { MpvTrack } from "@/types/player/videoPlayer";

describe("track identity", () => {
  it("normalizes an external track path", () => {
    expect(
      trackIdentity({
        id: 4,
        type: "sub",
        external: true,
        "external-filename": "D:\\Anime\\Subs\\Episode 01.ASS",
      })
    ).toBe("external:sub:d:/anime/subs/episode 01.ass");
  });

  it("builds an embedded identity from language and metadata", () => {
    expect(trackIdentity({ id: 2, type: "audio", lang: "RUS", codec: "AAC" })).toBe(
      "audio:rus|aac"
    );
  });

  it("resolves the current id by key before falling back to a numeric id", () => {
    const tracks: MpvTrack[] = [
      { id: 1, type: "audio", lang: "eng" },
      { id: 2, type: "audio", lang: "rus" },
    ];
    expect(resolveTrackId(tracks, "audio", 1, "audio:rus")).toBe(2);
    expect(resolveTrackId(tracks, "audio", 1, "audio:missing")).toBe(1);
  });
});

describe("local language defaults", () => {
  const tracks: MpvTrack[] = [
    { id: 1, type: "audio", lang: "eng" },
    { id: 8, type: "audio", lang: "JPN" },
    { id: 4, type: "sub", lang: "rus", external: true },
    { id: 9, type: "sub", title: "ja" },
  ];
  it("matches language aliases and sidecars without matching titles", () => {
    expect(preferredLanguageTrackId(tracks, "audio", " ja ")).toBe(8);
    expect(preferredLanguageTrackId(tracks, "sub", "ru")).toBe(4);
    expect(preferredLanguageTrackId(tracks, "sub", "ja")).toBeUndefined();
  });
  it.each(["", "und", "de"])("leaves mpv selection for %s", (language) => {
    expect(preferredLanguageTrackId(tracks, "audio", language)).toBeUndefined();
  });
});
