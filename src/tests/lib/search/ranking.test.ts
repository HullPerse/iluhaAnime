import { describe, expect, it } from "vitest";

import { recencyBoost } from "@/lib/search/ranking.utils";
import {
  fuzzyMatchScore,
  getSearchSuggestions,
  normalizeSearchText,
} from "@/lib/search/suggestions.utils";
import type { SearchAnimeSuggestion, SearchQueryStat } from "@/types/search";

describe("ml phase1 - normalize parity", () => {
  it("strips diacritics like Rust NFKD", () => {
    expect(normalizeSearchText("  Frieren   S02  ")).toBe("frieren s02");
    expect(normalizeSearchText("ЖЁсткий  Тест")).toBe("жесткии тест");
    expect(normalizeSearchText("café")).toBe("cafe");
    expect(normalizeSearchText("Friéren_S02")).toBe("frieren s02");
  });

  it("fuzzyScore still prefers exact > prefix", () => {
    expect(fuzzyMatchScore("frieren", "Frieren")).toBeGreaterThan(
      fuzzyMatchScore("friren", "Frieren")!
    );
  });
});

describe("ml phase1 - recency exp", () => {
  it("recency decays exponentially not linear", () => {
    expect(recencyBoost(0)).toBe(60);
    expect(recencyBoost(24)).toBeCloseTo(30, 0);
    expect(recencyBoost(48)).toBeCloseTo(15, 0);
    expect(recencyBoost(60)).toBeGreaterThan(5);
    expect(recencyBoost(60)).toBeLessThan(15);
  });
});

describe("ml phase1 - TTL", () => {
  it("purges stats older than 90 days", async () => {
    const { useSearchStore } = await import("@/store/search.store");
    const now = Date.now();
    const old = now - 91 * 24 * 60 * 60 * 1000;
    const queryStats: Record<string, SearchQueryStat> = {
      fresh: { count: 1, lastUsedAt: now, selectedCount: 0 },
      stale: { count: 5, lastUsedAt: old, selectedCount: 0 },
    };
    const suggestionStats: Record<string, SearchQueryStat> = {
      stale2: { count: 1, lastUsedAt: old, selectedCount: 0 },
    };
    useSearchStore.setState({ queryStats, suggestionStats });
    useSearchStore.getState().purgeExpired();
    const s = useSearchStore.getState();
    expect(s.queryStats["fresh"]).toBeDefined();
    expect(s.queryStats["stale"]).toBeUndefined();
    expect(s.suggestionStats["stale2"]).toBeUndefined();
  });

  it("getSearchSuggestions with Cyrillic ё still matches", () => {
    const idx: SearchAnimeSuggestion[] = [
      {
        id: 1,
        title: "Жёсткий тест",
        aliases: [],
        status: "COMPLETED",
        score: 0,
        favourite: false,
      },
    ];
    const sug = getSearchSuggestions("жесткий", { animeIndex: idx });
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0].value).toBe("Жёсткий тест");
  });
});
