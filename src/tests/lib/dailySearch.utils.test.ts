import { describe, expect, it } from "vitest";

import { matchingAlias, rankSuggestions, titleMatchRank } from "@/lib/daily/search.utils";
import type { AniMedia } from "@/types/anilist/anilist";

function media(title: string, titles: string[] = [], extra: Partial<AniMedia> = {}): AniMedia {
  return { id: 1, title, titles, ...extra } as AniMedia;
}

describe("matchingAlias", () => {
  it("returns a synonym that contains the query", () => {
    const target = media("Kimetsu no Yaiba", ["Demon Slayer"]);
    expect(matchingAlias(target, "demon")).toBe("Demon Slayer");
  });

  it("ignores the primary title", () => {
    const target = media("Kimetsu no Yaiba", ["Kimetsu no Yaiba", "Demon Slayer"]);
    expect(matchingAlias(target, "kimetsu")).toBeNull();
  });

  it("returns null for an empty query", () => {
    const target = media("Kimetsu no Yaiba", ["Demon Slayer"]);
    expect(matchingAlias(target, "   ")).toBeNull();
  });
});

describe("titleMatchRank", () => {
  const target = media("Kimetsu no Yaiba", ["Demon Slayer"]);

  it("ranks an exact primary title highest", () => {
    expect(titleMatchRank(target, "kimetsu no yaiba")).toBe(4);
  });

  it("ranks primary prefixes and contains above aliases", () => {
    expect(titleMatchRank(target, "kimetsu")).toBe(3);
    expect(titleMatchRank(target, "yaiba")).toBe(2);
  });

  it("ranks an exact alias below the primary title", () => {
    expect(titleMatchRank(target, "demon slayer")).toBe(2);
    expect(titleMatchRank(target, "demon")).toBe(1);
  });

  it("returns zero for an empty or missing query", () => {
    expect(titleMatchRank(target, "")).toBe(0);
    expect(titleMatchRank(target, "nonexistent")).toBe(0);
  });
});

describe("rankSuggestions", () => {
  it("puts a primary exact match above an exact alias", () => {
    const alias = media("Kimetsu no Yaiba", ["Demon Slayer"]);
    const primary = media("Demon Slayer", []);
    expect(rankSuggestions([alias, primary], "demon slayer").map((item) => item.title)).toEqual([
      "Demon Slayer",
      "Kimetsu no Yaiba",
    ]);
  });

  it("breaks a relevance tie by popularity", () => {
    const low = media("Low", [], { popularity: 10 });
    const high = media("High", [], { popularity: 100 });
    expect(rankSuggestions([low, high], "zzz").map((item) => item.title)).toEqual(["High", "Low"]);
  });
});
