import { describe, expect, it } from "vitest";

import { parseAnimeSearchTitle } from "@/lib/anilist.match";

describe("parseAnimeSearchTitle", () => {
  it("strips the extension", () => {
    expect(parseAnimeSearchTitle("Bleach.mkv")).toBe("Bleach");
  });

  it("removes fansub groups and hash tags in brackets", () => {
    expect(
      parseAnimeSearchTitle("[SubsPlease] One Piece - 1080p [B86E8915].mkv")
    ).toBe("One Piece");
  });

  it("removes quality and codec parens", () => {
    expect(
      parseAnimeSearchTitle("Frieren (1080p) (HEVC) - 01.mkv")
    ).toBe("Frieren");
  });

  it("strips dash-episode numbers", () => {
    expect(
      parseAnimeSearchTitle("Fullmetal Alchemist - 01v2.mkv")
    ).toBe("Fullmetal Alchemist");
  });

  it("strips bracket episode numbers", () => {
    expect(
      parseAnimeSearchTitle("Naruto [01].mkv")
    ).toBe("Naruto");
  });

  it("strips S/E season tokens", () => {
    expect(
      parseAnimeSearchTitle("Attack on Titan S03E05.mkv")
    ).toBe("Attack on Titan");
  });

  it("strips a trailing year", () => {
    expect(parseAnimeSearchTitle("Violet Evergarden (2018).mkv")).toBe(
      "Violet Evergarden"
    );
    expect(parseAnimeSearchTitle("Violet Evergarden 2018.mkv")).toBe(
      "Violet Evergarden"
    );
  });

  it("strips Japanese episode markers", () => {
    expect(parseAnimeSearchTitle("鬼滅の刃 第01話.mkv")).toBe("鬼滅の刃");
  });

  it("collapses duplicate whitespace", () => {
    expect(
      parseAnimeSearchTitle("  Jujutsu   Kaisen   (2020)  ")
    ).toBe("Jujutsu Kaisen");
  });

  it("keeps roman numerals that are part of the title", () => {
    expect(parseAnimeSearchTitle("Digimon Adventure 02.mkv")).toBe(
      "Digimon Adventure 02"
    );
  });

  it("returns an empty string for garbage-only names", () => {
    expect(parseAnimeSearchTitle("[SubsPlease] 1080p.mkv")).toBe("");
  });
});