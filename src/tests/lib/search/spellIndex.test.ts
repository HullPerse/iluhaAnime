import { beforeEach, describe, expect, it } from "vitest";

import { LazySpellIndex } from "@/lib/search/lazySpellIndex.utils";
import { isRomanNumeral } from "@/lib/search/roman.utils";
import { readCachedSpellWords, writeCachedSpellWords } from "@/lib/search/spellIndexCache.utils";
import { suggestSpelling } from "@/lib/search/suggestions.utils";
import { buildSymSpellFromTitles, normalizedSpellWords } from "@/lib/search/symspell.utils";
import type { SearchAnimeSuggestion } from "@/types/search";

const STORAGE_KEY = "iluha.v1.spellindex";

function anime(title: string, id: number): SearchAnimeSuggestion {
  return {
    id,
    title,
    aliases: [],
    status: "COMPLETED",
    season: null,
    seasonYear: null,
    score: null,
    favourite: false,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("normalizedSpellWords", () => {
  it("keeps unique normalized words of length >= 3 in order", () => {
    expect(normalizedSpellWords(["Frieren: Beyond Journey's End", "Sousou no Frieren"])).toEqual([
      "frieren",
      "beyond",
      "journey",
      "end",
      "sousou",
    ]);
  });
});

describe("LazySpellIndex", () => {
  const titles = ["Frieren", "Naruto Shippuden", "Bleach", "Jujutsu Kaisen"];
  const words = normalizedSpellWords(titles);

  it("starts cold and matches the eager index once pumped", () => {
    const lazy = new LazySpellIndex(words);
    expect(lazy.ready).toBe(false);
    expect(lazy.pump(1)).toBe(false);
    expect(lazy.ready).toBe(false);
    while (!lazy.pump(2));
    expect(lazy.ready).toBe(true);

    const eager = buildSymSpellFromTitles(titles);
    expect(lazy.suggestMany("friren", 3)).toEqual(eager.suggestMany("friren", 3));
    expect(lazy.suggestMany("naruto shipuden", 3)).toEqual(eager.suggestMany("naruto shipuden", 3));
  });

  it("answers exact words from the cheap set without building deletes", () => {
    const lazy = new LazySpellIndex(normalizedSpellWords(titles));
    expect(lazy.suggestMany("frieren")).toEqual([]);
    expect(lazy.ready).toBe(false);
  });

  it("finishes a cold index synchronously on the first real query", () => {
    const lazy = new LazySpellIndex(words);
    expect(lazy.suggest("friren")).toBe("frieren");
    expect(lazy.ready).toBe(true);
  });

  it("reports its normalized word list for persistence", () => {
    expect(new LazySpellIndex(words).normalizedWords()).toBe(words);
  });
});

describe("spell word cache", () => {
  it("round-trips words for a fingerprint", () => {
    writeCachedSpellWords("fp-1", ["frieren", "naruto"]);
    expect(readCachedSpellWords("fp-1")).toEqual(["frieren", "naruto"]);
    expect(readCachedSpellWords("other")).toBeNull();
  });

  it("keeps at most two fingerprints, newest first", () => {
    writeCachedSpellWords("fp-1", ["frieren"]);
    writeCachedSpellWords("fp-2", ["naruto"]);
    writeCachedSpellWords("fp-3", ["bleach"]);
    expect(readCachedSpellWords("fp-3")).toEqual(["bleach"]);
    expect(readCachedSpellWords("fp-2")).toEqual(["naruto"]);
    expect(readCachedSpellWords("fp-1")).toBeNull();
  });

  it("skips empty fingerprints, empty lists and oversized dictionaries", () => {
    writeCachedSpellWords("", ["frieren"]);
    writeCachedSpellWords("fp-empty", []);
    writeCachedSpellWords(
      "fp-big",
      Array.from({ length: 60001 }, (_, index) => `word${index}`)
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores a corrupt envelope", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readCachedSpellWords("fp-1")).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ f: 2, entries: [] }));
    expect(readCachedSpellWords("fp-1")).toBeNull();
  });
});

describe("roman numerals", () => {
  it("accepts canonical numerals only", () => {
    for (const value of ["i", "ii", "iii", "iv", "ix", "xii", "xx", "xl", "cm", "mix"]) {
      expect(isRomanNumeral(value), value).toBe(true);
    }
    for (const value of ["frieren", "abc", "", "iiii", "vx", "four", "im"]) {
      expect(isRomanNumeral(value), value).toBe(false);
    }
  });

  it("never corrects a numeral token", () => {
    const sym = buildSymSpellFromTitles(["Frieren III", "Naruto", "Bleach"]);
    expect(sym.suggestMany("frieren ii", 3)).toEqual([]);
    expect(sym.correct("ii")).toBeNull();
  });

  it("still corrects a real typo next to a numeral", () => {
    const sym = buildSymSpellFromTitles(["Frieren III", "Naruto", "Bleach"]);
    expect(sym.suggest("frieren ii narutoo")).toBe("frieren ii naruto");
  });

  it("leaves the numeral alone end to end", () => {
    const animeIndex = [anime("Frieren III", 1), anime("Naruto", 2)];
    expect(suggestSpelling("frieren ii", { animeIndex, symSpell: true })).toBeNull();
    expect(suggestSpelling("frieren friren", { animeIndex, symSpell: true })).toBe(
      "frieren frieren"
    );
  });
});
