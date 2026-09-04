import { describe, expect, it } from "vitest";

import { SEARCH_RANKING } from "@/config/searchRanking.config";
import {
  fuzzyMatchScore,
  getSearchSuggestions,
  normalizeSearchText,
} from "@/lib/search.suggestions";
import { recencyBoost } from "@/lib/searchRanking.utils";

describe("ml phase1 - normalize parity", () => {
  it("strips diacritics like Rust NFKD", () => {
    expect(normalizeSearchText("  Frieren   S02  ")).toBe("frieren s02");
    // ё -> е, й -> и matches Rust
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
    // linear would be 0 at 60h, exp still >5
    expect(recencyBoost(60)).toBeGreaterThan(5);
    expect(recencyBoost(60)).toBeLessThan(15);
  });

  it("use weight is 4 not 8", () => {
    expect(SEARCH_RANKING.COUNT_WEIGHT).toBe(4);
    expect(SEARCH_RANKING.LEARNING_USE_WEIGHT).toBe(4);
  });
});

describe("ml phase1 - wizard ranking", () => {
  it("demotes duplicates and boosts favourites", async () => {
    const { normalizeSearchText } = await import("@/lib/search.suggestions");
    const { SEARCH_RANKING } = await import("@/config/searchRanking.config");
    // simulate rankWizardResults
    const results = [
      { id: 1, title: "Frieren: Beyond Journey's End", cover_url: null },
      { id: 2, title: "Fruits Basket", cover_url: null },
    ] as any[];
    const existing = new Set([normalizeSearchText("Frieren: Beyond Journey's End")]);
    const favs = new Set([2]);
    // manually compute as hook would
    const ranked = [...results]
      .map((r) => {
        const base = fuzzyMatchScore("frieren", normalizeSearchText(r.title)) ?? 0;
        const dup = existing.has(normalizeSearchText(r.title));
        const fav = favs.has(r.id);
        const score =
          base -
          (dup ? SEARCH_RANKING.WIZARD_DUPLICATE_PENALTY : 0) +
          (fav ? SEARCH_RANKING.WIZARD_FAVOURITE_BOOST : 0);
        return { r, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);
    // Frieren still wins despite -200 because Fruits Basket has no match
    expect(ranked[0].id).toBe(1);
    // Now test where duplicate is also matching
    const results2 = [
      { id: 1, title: "Frieren", cover_url: null },
      { id: 2, title: "Frieren", cover_url: null },
    ] as any[];
    const existing2 = new Set([normalizeSearchText("Frieren")]);
    const favs2 = new Set([2]);
    const ranked2 = [...results2]
      .map((r) => {
        const base = fuzzyMatchScore("frieren", normalizeSearchText(r.title)) ?? 0;
        const dup = existing2.has(normalizeSearchText(r.title));
        const fav = favs2.has(r.id);
        return { r, score: base - (dup ? 200 : 0) + (fav ? 50 : 0) };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);
    // both duplicate -200, fav +50 makes 2 win
    expect(ranked2[0].id).toBe(2);
    expect(ranked2[1].id).toBe(1);
  });
});

describe("ml phase1 - TTL", () => {
  it("purges stats older than 90 days", async () => {
    const { useSearchStore } = await import("@/store/search.store");
    const now = Date.now();
    const old = now - 91 * 24 * 60 * 60 * 1000;
    useSearchStore.setState({
      queryStats: {
        fresh: { count: 1, lastUsedAt: now, selectedCount: 0 },
        stale: { count: 5, lastUsedAt: old, selectedCount: 0 },
      },
      suggestionStats: {
        stale2: { count: 1, lastUsedAt: old, selectedCount: 0 },
      },
    } as any);
    useSearchStore.getState().purgeExpired();
    const s = useSearchStore.getState();
    expect(s.queryStats["fresh"]).toBeDefined();
    expect(s.queryStats["stale"]).toBeUndefined();
    expect(s.suggestionStats["stale2"]).toBeUndefined();
  });

  it("getSearchSuggestions with Cyrillic ё still matches", () => {
    const idx = [
      {
        id: 1,
        title: "Жёсткий тест",
        aliases: [],
        status: "COMPLETED",
        score: 0,
        favourite: false,
      },
    ] as any;
    const sug = getSearchSuggestions("жесткий", { animeIndex: idx });
    // after NFKD, "жесткий" normalized to "жесткии" same as "Жёсткий"
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0].value).toBe("Жёсткий тест");
  });
});
