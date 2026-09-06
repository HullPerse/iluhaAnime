import { describe, expect, it } from "vitest";

import { readStoredMedia, withStoredMedia } from "@/lib/collection/media.utils";

describe("stored media helpers", () => {
  it("reads empty media from null details", () => {
    expect(readStoredMedia(null)).toEqual({ stills: [], trailerYoutubeId: null });
  });

  it("reads stored stills and trailer", () => {
    expect(readStoredMedia({ stills: ["a"], trailerYoutubeId: "t", seasons: [] })).toEqual({
      stills: ["a"],
      trailerYoutubeId: "t",
    });
  });

  it("merges media while keeping seasons", () => {
    expect(
      withStoredMedia({ seasons: [{ seasonNumber: 1, episodeCount: 2, name: "S1" }] }, ["a"], "t")
    ).toEqual({
      seasons: [{ seasonNumber: 1, episodeCount: 2, name: "S1" }],
      stills: ["a"],
      trailerYoutubeId: "t",
    });
  });
});
