import { describe, expect, it } from "vitest";

import {
  fuzzyMatchScore,
  getInlineCompletion,
  getSearchSuggestions,
  normalizeSearchText,
} from "@/lib/search.suggestions";
import type { SearchAnimeSuggestion } from "@/types/search";

const animeIndex: SearchAnimeSuggestion[] = [
  {
    aliases: ["Sousou no Frieren"],
    favourite: true,
    id: 1,
    score: 95,
    status: "COMPLETED",
    title: "Frieren: Beyond Journey's End",
  },
  {
    aliases: [],
    favourite: false,
    id: 2,
    score: 0,
    status: "PLANNING",
    title: "Fruits Basket",
  },
];

describe("search suggestions", () => {
  it("normalizes punctuation and diacritics", () => {
    expect(normalizeSearchText("  Friéren_S02  ")).toBe("frieren s02");
  });

  it("prefers exact and prefix matches over fuzzy matches", () => {
    expect(fuzzyMatchScore("frieren", "Frieren")).toBeGreaterThan(
      fuzzyMatchScore("frier", "Frieren")!
    );
    expect(fuzzyMatchScore("friren", "Frieren")).not.toBeNull();
  });

  it("uses AniList favourites and status as a secondary ranking signal", () => {
    const suggestions = getSearchSuggestions("fr", {
      animeIndex,
      limit: 5,
    });
    expect(suggestions[0]?.value).toBe("Frieren: Beyond Journey's End");
    expect(suggestions[0]?.kind).toBe("anime");
  });

  it("hides backend anime suggestions when AniList is not authenticated", () => {
    const backendSuggestions = [
      {
        kind: "anime" as const,
        score: 900,
        value: "Frieren: Beyond Journey's End",
      },
      {
        kind: "history" as const,
        score: 700,
        value: "frieren 1080p",
      },
    ];
    const hidden = getSearchSuggestions("fri", {
      animeEnabled: false,
      backendSuggestions,
      limit: 5,
    });
    expect(hidden.map((item) => item.kind)).not.toContain("anime");
    expect(hidden).toContainEqual(
      expect.objectContaining({ value: "frieren 1080p" })
    );

    const shown = getSearchSuggestions("fri", {
      animeEnabled: true,
      backendSuggestions,
      limit: 5,
    });
    expect(shown.map((item) => item.kind)).toContain("anime");
  });

  it("learns from repeated and selected history without duplicating values", () => {
    const suggestions = getSearchSuggestions("fri", {
      animeIndex: [],
      history: ["frieren 1080p", "frieren bd"],
      queryStats: {
        "frieren 1080p": {
          count: 10,
          lastUsedAt: Date.now(),
          selectedCount: 2,
        },
      },
      suggestionStats: {},
      limit: 5,
    });
    expect(suggestions[0]?.value).toBe("frieren 1080p");
    expect(new Set(suggestions.map((item) => item.value)).size).toBe(
      suggestions.length
    );
  });

  it("penalizes ignored suggestions and supports scope filtering", () => {
    const suggestions = getSearchSuggestions("fri", {
      animeIndex,
      scope: "player",
      suggestionStats: {
        "frieren: beyond journey's end": {
          count: 0,
          ignoredCount: 3,
          lastUsedAt: Date.now(),
          selectedCount: 0,
        },
      },
    });
    expect(suggestions).toEqual([]);
  });

  it("returns only prefix completions for ghost text", () => {
    const suggestions = getSearchSuggestions("fr", { animeIndex });
    expect(getInlineCompletion("fr", suggestions)).toBe(
      "Frieren: Beyond Journey's End"
    );
    expect(getInlineCompletion("x", suggestions)).toBeNull();
  });

  it("matches multi-word queries against distinct words", () => {
    const match = fuzzyMatchScore(
      "frieren journey",
      "Frieren: Beyond Journey's End"
    );
    expect(match).not.toBeNull();
    expect(fuzzyMatchScore("frieren journey", "Fruits Basket")).toBeNull();
    expect(match!).toBeGreaterThan(500);
  });

  it("prefers matches at word boundaries over mid-word substrings", () => {
    const atBoundary = fuzzyMatchScore("att", "Attack on Titan");
    const midWord = fuzzyMatchScore("att", "Somewhere in Battle Tactics");
    expect(atBoundary).not.toBeNull();
    expect(atBoundary!).toBeGreaterThan(midWord!);
  });

  it("rejects multi-word queries missing a word", () => {
    expect(
      fuzzyMatchScore("frieren zzz", "Frieren: Beyond Journey's End")
    ).toBeNull();
  });
});
