import { describe, expect, it } from "vitest";

import { animeTitleFields, resolveAnimeTitle } from "@/lib/anilist/title.utils";

const FULL = {
  romaji: "Sousou no Frieren",
  english: "Frieren: Beyond Journey's End",
  native: "葬送のフリーレン",
};

describe("resolveAnimeTitle", () => {
  it("prefers the requested language", () => {
    expect(resolveAnimeTitle(FULL, "romaji")).toBe("Sousou no Frieren");
    expect(resolveAnimeTitle(FULL, "english")).toBe("Frieren: Beyond Journey's End");
    expect(resolveAnimeTitle(FULL, "native")).toBe("葬送のフリーレン");
  });

  it("falls back through english, romaji, native", () => {
    expect(resolveAnimeTitle({ romaji: "R", english: null, native: "N" }, "english")).toBe("R");
    expect(resolveAnimeTitle({ romaji: "", english: null, native: "N" }, "romaji")).toBe("N");
  });

  it("starts at english without a preference", () => {
    expect(resolveAnimeTitle(FULL, null)).toBe("Frieren: Beyond Journey's End");
    expect(resolveAnimeTitle(FULL, undefined)).toBe("Frieren: Beyond Journey's End");
  });

  it("skips blank values", () => {
    expect(resolveAnimeTitle({ romaji: "R", english: "  ", native: "N" }, "english")).toBe("R");
  });

  it("returns empty without usable titles", () => {
    expect(resolveAnimeTitle(null, "romaji")).toBe("");
    expect(resolveAnimeTitle(undefined, "english")).toBe("");
    expect(resolveAnimeTitle({ romaji: "", english: " ", native: null }, "native")).toBe("");
  });
});

describe("animeTitleFields", () => {
  it("prefers the structured variants and trims them", () => {
    expect(
      animeTitleFields({
        title: "flat",
        title_romaji: "  R  ",
        title_english: "E",
        title_native: "N",
      })
    ).toEqual({ romaji: "R", english: "E", native: "N" });
  });

  it("fills a missing romaji from english, native, or the flat title", () => {
    expect(animeTitleFields({ title: "flat", title_english: "E" }).romaji).toBe("E");
    expect(animeTitleFields({ title: "flat", title_native: "N" }).romaji).toBe("N");
    expect(animeTitleFields({ title: "  flat  " }).romaji).toBe("flat");
  });
});
