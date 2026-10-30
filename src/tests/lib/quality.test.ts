import { describe, expect, it } from "vitest";

import { resolveTitleQuery } from "@/lib/search/searchHypothesis.utils";
import { suggestSpellingWithReason } from "@/lib/search/searchResolve.utils";
import { getSearchSuggestions } from "@/lib/core/suggestions.utils";
import type { AnimeTitle, SearchAnimeSuggestion } from "@/types/search/search";

interface FixtureVariant {
  kind: AnimeTitle["kind"];
  language: AnimeTitle["language"];
  title: string;
}

function typed(id: number, title: string, variants: FixtureVariant[]): SearchAnimeSuggestion {
  return {
    aliases: [],
    favourite: false,
    id,
    score: null,
    status: "FINISHED",
    title,
    typedTitles: variants.map((entry) => ({ animeId: id, source: "anilist", ...entry })),
  };
}

function entry(
  id: number,
  title: string,
  romaji?: string,
  ...aliases: Array<{ kind: AnimeTitle["kind"]; title: string }>
): SearchAnimeSuggestion {
  return typed(id, title, [
    { kind: "official", language: "en", title },
    ...(romaji ? [{ kind: "romaji", language: "ro", title: romaji } as FixtureVariant] : []),
    ...aliases.map((alias) => ({ ...alias, language: null as FixtureVariant["language"] })),
  ]);
}

const INDEX: SearchAnimeSuggestion[] = [
  entry(1, "Frieren: Beyond Journey's End", "Sousou no Frieren", {
    kind: "alias",
    title: "Frieren",
  }),
  entry(2, "Naruto Shippuden", undefined, { kind: "alias", title: "Naruto" }),
  entry(3, "One Piece", undefined, { kind: "alias", title: "OP" }),
  entry(
    4,
    "Attack on Titan",
    "Shingeki no Kyojin",
    { kind: "alias", title: "AoT" },
    { kind: "alias", title: "SnK" }
  ),
  entry(5, "Demon Slayer: Kimetsu no Yaiba", undefined, { kind: "alias", title: "KnY" }),
  entry(6, "Jujutsu Kaisen"),
  entry(7, "Chainsaw Man"),
  entry(8, "Spy x Family"),
  entry(9, "Vinland Saga"),
  entry(10, "Cowboy Bebop"),
  entry(11, "Steins;Gate"),
  entry(12, "Fullmetal Alchemist: Brotherhood", undefined, { kind: "alias", title: "FMAB" }),
  entry(13, "Hunter x Hunter (2011)"),
  entry(14, "Bleach"),
  entry(15, "Re:Zero"),
];

function topValue(query: string): string | undefined {
  return getSearchSuggestions(query, { animeIndex: INDEX, limit: 3 })[0]?.value;
}

describe("search/quality typo", () => {
  const cases: Array<[query: string, expectTop: string]> = [
    ["friren", "Frieren: Beyond Journey's End"],
    ["naruto ship", "Naruto Shippuden"],
    ["attak on titan", "Attack on Titan"],
    ["demon slayer", "Demon Slayer: Kimetsu no Yaiba"],
    ["jujutsu kaisen", "Jujutsu Kaisen"],
    ["bleach", "Bleach"],
    ["fullmetal alchemist", "Fullmetal Alchemist: Brotherhood"],
    ["steins gate", "Steins;Gate"],
    ["spy x family", "Spy x Family"],
    ["vinland saga", "Vinland Saga"],
    ["cowboy bebop", "Cowboy Bebop"],
    ["re zero", "Re:Zero"],
    ["chainsaw man", "Chainsaw Man"],
    ["one piece", "One Piece"],
  ];
  it.each(cases)("ranks %s first", (query, expectTop) => {
    expect(topValue(query)).toBe(expectTop);
  });
  it("keeps Top-1 accuracy at 1.0 on the typo set", () => {
    const hits = cases.filter(([query, expectTop]) => topValue(query) === expectTop).length;
    expect(hits / cases.length).toBe(1);
  });
});

describe("search/quality resolver", () => {
  const cases: Array<[query: string, animeId: number]> = [
    ["frieren s2", 1],
    ["attack on titan s4", 4],
    ["bleach II", 14],
    ["one piece 1000", 3],
    ["hunter x hunter 2011", 13],
    ["naruto season 2", 2],
  ];
  it.each(cases)("resolves %s to anime %i", (query, animeId) => {
    expect(resolveTitleQuery(query, { animeIndex: INDEX })[0]?.animeId).toBe(animeId);
  });
  it("keeps Recall@3 at 1.0 on the resolver set", () => {
    const hits = cases.filter(([query, animeId]) =>
      resolveTitleQuery(query, { animeIndex: INDEX, limit: 3 }).some(
        (hyp) => hyp.animeId === animeId
      )
    ).length;
    expect(hits / cases.length).toBe(1);
  });
});

describe("search/quality reasons", () => {
  it("classifies every reason case correctly", () => {
    expect(suggestSpellingWithReason("friren", { animeIndex: INDEX })?.reason).toBe("typo");
    expect(
      suggestSpellingWithReason("sosou no friren", { history: ["sousou no frieren"] })?.reason
    ).toBe("transliteration");
    expect(suggestSpellingWithReason("snk", { animeIndex: INDEX })).toMatchObject({
      correction: "Attack on Titan",
      reason: "alias",
    });
    expect(suggestSpellingWithReason("frie", { animeIndex: INDEX })?.reason).toBe("partial");
    expect(suggestSpellingWithReason("frieren s5", { animeIndex: INDEX })?.reason).toBe(
      "wrong_season"
    );
    expect(suggestSpellingWithReason("friren s2", { animeIndex: INDEX })).toMatchObject({
      correction: "Frieren s2",
      reason: "typo",
    });
    expect(suggestSpellingWithReason("frieren quality=4d", { animeIndex: INDEX })).toMatchObject({
      correction: "frieren",
      reason: "wrong_format",
    });
    expect(suggestSpellingWithReason("xyz123", { animeIndex: INDEX })).toBeNull();
  });
});
