import { describe, expect, it } from "vitest";

import { isSourceImage } from "@/lib/graphics/images.utils";

describe("stream/images", () => {
  it("treats AnimeLib and Kodik hosts as source images", () => {
    expect(isSourceImage("https://cover.imglib.info/uploads/anime/1/cover.jpg")).toBe(true);
    expect(isSourceImage("https://video1.imglib.info/uploads/a.mp4")).toBe(true);
    expect(isSourceImage("https://api.cdnlibs.org/x.jpg")).toBe(true);
    expect(isSourceImage("https://kodikplayer.com/seria/1/720p")).toBe(true);
  });

  it("treats AniList and streaming-service previews as not source images", () => {
    expect(isSourceImage("https://img1.ak.crunchyroll.com/i/spire1/1.jpg")).toBe(false);
    expect(isSourceImage("https://s4.anilist.co/file/anilistcdn/media/anime/cover/1.jpg")).toBe(
      false
    );
  });

  it("ignores empty and malformed values", () => {
    expect(isSourceImage("")).toBe(false);
    expect(isSourceImage("   ")).toBe(false);
    expect(isSourceImage("not a url")).toBe(false);
  });
});
