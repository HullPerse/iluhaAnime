import { describe, expect, it } from "vitest";

import { parseTitleAttributes, romanToInt } from "@/lib/search/searchMarkers.utils";
import { resolveTitleQuery } from "@/lib/search/searchHypothesis.utils";
import { suggestSpellingWithReason } from "@/lib/search/searchResolve.utils";
import type { SearchAnimeSuggestion } from "@/types/search/search";

function anime(id: number, title: string, aliases: string[] = []): SearchAnimeSuggestion {
  return { aliases, favourite: false, id, score: null, status: "FINISHED", title };
}

const INDEX = [
  anime(1, "Frieren: Beyond Journey's End", ["Sousou no Frieren", "Frieren"]),
  anime(2, "Naruto Shippuden", ["Naruto"]),
  anime(3, "Hunter x Hunter (2011)"),
];

describe("search/resolve", () => {
  it("parses explicit season markers", () => {
    expect(parseTitleAttributes("frieren s2")).toMatchObject({ remainder: "frieren", season: 2 });
    expect(parseTitleAttributes("frieren season 2")).toMatchObject({
      remainder: "frieren",
      season: 2,
    });
    expect(parseTitleAttributes("frieren 2nd season")).toMatchObject({
      remainder: "frieren",
      season: 2,
    });
  });

  it("parses explicit episode markers", () => {
    expect(parseTitleAttributes("frieren e03")).toMatchObject({ episode: 3, remainder: "frieren" });
    expect(parseTitleAttributes("frieren ep 12")).toMatchObject({
      episode: 12,
      remainder: "frieren",
    });
  });

  it("keeps filter values for parseIntent", () => {
    expect(parseTitleAttributes("year >= 2020").remainder).toBe("year >= 2020");
    expect(parseTitleAttributes("date >= 2024").year).toBeNull();
    expect(parseTitleAttributes("episodes=24").episode).toBeNull();
  });

  it("resolves season queries to the title with season attached", () => {
    const [top] = resolveTitleQuery("frieren s2", { animeIndex: INDEX });
    expect(top).toMatchObject({ animeId: 1, remainder: "frieren", season: 2 });
  });

  it("keeps bare trailing numbers ambiguous", () => {
    const bare = resolveTitleQuery("frieren 12");
    expect(bare).toMatchObject([
      { episode: 12, remainder: "frieren" },
      { episode: null, remainder: "frieren 12" },
    ]);
    const out = resolveTitleQuery("frieren 12", { animeIndex: INDEX });
    expect(out[0]).toMatchObject({ animeId: 1, episode: 12, remainder: "frieren" });
  });

  it("treats a trailing roman numeral as a season hypothesis", () => {
    expect(romanToInt("II")).toBe(2);
    const out = resolveTitleQuery("frieren II", { animeIndex: INDEX });
    expect(out[0]).toMatchObject({ animeId: 1, remainder: "frieren", season: 2 });
  });

  it("strips release years but keeps the title", () => {
    const [top] = resolveTitleQuery("hunter x hunter 2011", { animeIndex: INDEX });
    expect(top?.animeId).toBe(3);
    expect(top?.year).toBe(2011);
  });

  it("falls back to the raw query when nothing parses", () => {
    expect(resolveTitleQuery("2020")).toMatchObject([{ remainder: "2020" }]);
    expect(resolveTitleQuery("   ")).toEqual([]);
    expect(resolveTitleQuery("frieren s2")).toMatchObject([{ remainder: "frieren", season: 2 }]);
  });
});

describe("search/reason", () => {
  const typed = (
    id: number,
    title: string,
    typedTitles: SearchAnimeSuggestion["typedTitles"]
  ): SearchAnimeSuggestion => ({
    aliases: [],
    favourite: false,
    id,
    score: null,
    status: "FINISHED",
    title,
    typedTitles,
  });

  it("marks plain edit-distance fixes as typos", () => {
    expect(suggestSpellingWithReason("friren", { animeIndex: INDEX })).toMatchObject({
      correction: "Frieren",
      reason: "typo",
    });
  });

  it("marks romanization variants as transliteration", () => {
    expect(
      suggestSpellingWithReason("sosou no friren", { history: ["sousou no frieren"] })
    ).toMatchObject({ reason: "transliteration" });
  });

  it("expands fan aliases instead of flagging them", () => {
    const index = [
      typed(7, "Shingeki no Kyojin", [
        {
          animeId: 7,
          kind: "official",
          language: "en",
          source: "anilist",
          title: "Shingeki no Kyojin",
        },
        { animeId: 7, kind: "alias", language: null, source: "anilist", title: "SnK" },
      ]),
    ];
    expect(suggestSpellingWithReason("snk", { animeIndex: index })).toMatchObject({
      correction: "Shingeki no Kyojin",
      reason: "alias",
    });
  });

  it("marks strict prefixes as partial", () => {
    expect(suggestSpellingWithReason("frie", { animeIndex: INDEX })).toMatchObject({
      reason: "partial",
    });
  });

  it("marks a specified season on a known title as wrong_season", () => {
    expect(suggestSpellingWithReason("frieren s5", { animeIndex: INDEX })).toMatchObject({
      evidence: { season: 5 },
      reason: "wrong_season",
    });
  });

  it("strips invalid torrent tags as wrong_format", () => {
    expect(suggestSpellingWithReason("frieren quality=4d", { animeIndex: INDEX })).toMatchObject({
      correction: "frieren",
      evidence: { tag: "quality" },
      reason: "wrong_format",
    });
    expect(suggestSpellingWithReason("frieren quality=1080p", { animeIndex: INDEX })).toBeNull();
  });
});
