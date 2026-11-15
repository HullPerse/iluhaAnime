import { describe, expect, it } from "vitest";

import { localGuessSuggestions } from "@/lib/daily/localSearch.utils";
import { matchingAlias, rankSuggestions, titleMatchRank } from "@/lib/daily/search.utils";
import type { AniMedia } from "@/types/anilist/anilist";
import type { DailySearchEntry } from "@/types/api/daily";

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

describe("localGuessSuggestions", () => {
  const entries: DailySearchEntry[] = [
    { mediaId: 1, title: "Shingeki no Kyojin", year: 2013, format: "TV", popularity: 100 },
    { mediaId: 2, title: "Shingeki no Kyojin: Chronicle", year: 2020, format: "MOVIE", popularity: 80 },
    { mediaId: 3, title: "Kimetsu no Yaiba", year: 2019, format: "TV", popularity: 90 },
  ];

  it("returns prefix matches before contains matches and respects the limit", () => {
    expect(localGuessSuggestions(entries, "shingeki", 1).map((item) => item.title)).toEqual([
      "Shingeki no Kyojin",
    ]);
    expect(localGuessSuggestions(entries, "kyojin", 2)).toHaveLength(2);
  });

  it("requires at least two normalized characters", () => {
    expect(localGuessSuggestions(entries, "s", 6)).toEqual([]);
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
