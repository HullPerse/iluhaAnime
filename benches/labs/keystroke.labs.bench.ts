import { bench, group } from "@pmndrs/labs";

import type { SearchAnimeSuggestion } from "../../src/types/search/search";
import {
  getSearchSuggestions,
  groupSuggestions,
  suggestSpelling,
} from "../../src/lib/core/suggestions.utils";

// Keystroke latency of the suggest pipeline at a 2000-title index.
// Budget: one typed word (five prefixes) stays under one 16ms frame at 2000
// titles; the single-char case is the worst path and runs only with @slow.
// Each bench returns a checksum so labs can detect dead code elimination.
// Fixtures are deterministic: a seeded LCG, no Math.random.

const WORDS = [
  "frieren",
  "sousou",
  "naruto",
  "bleach",
  "piece",
  "attack",
  "titan",
  "demon",
  "slayer",
  "jujutsu",
  "kaisen",
  "chainsaw",
  "spy",
  "family",
  "vinland",
  "saga",
  "evangelion",
  "bebop",
  "steins",
  "gate",
  "zero",
  "konosuba",
  "overlord",
  "tokyo",
  "ghoul",
  "hunter",
  "fullmetal",
  "alchemist",
  "death",
  "note",
];

function makeIndex(n: number): SearchAnimeSuggestion[] {
  const out: SearchAnimeSuggestion[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) {
    const w = 1 + Math.floor(rnd() * 3);
    const parts: string[] = [];
    for (let k = 0; k < w; k++) parts.push(WORDS[Math.floor(rnd() * WORDS.length)]!);
    const alias: string[] = [];
    for (let k = parts.length - 1; k >= 0; k--) alias.push(parts[k]!);
    out.push({
      id: i,
      title: `${parts.join(" ")} ${i}`,
      aliases: [alias.join(" ")],
      status: "COMPLETED",
      season: "WINTER",
      seasonYear: 2020 + (i % 6),
      score: 70 + (i % 30),
      favourite: i % 50 === 0,
    });
  }
  return out;
}

const HISTORY = [
  "frieren",
  "one piece",
  "naruto shippuden",
  "attack on titan",
  "berserk",
  "re zero",
  "spy x family",
  "chainsaw man",
  "jujutsu kaisen",
  "vinland saga",
];

const INDEX_2000 = makeIndex(2000);
const PREFIXES = ["fr", "fri", "frie", "frier", "frieren"];

function typeWord(prefixes: readonly string[]): number {
  let checksum = 0;
  for (const q of prefixes) {
    const sug = getSearchSuggestions(q, { history: HISTORY, animeIndex: INDEX_2000, limit: 8 });
    checksum += sug.length;
    const spell = suggestSpelling(q, {
      history: HISTORY,
      animeIndex: INDEX_2000,
      extraValues: undefined,
      symSpell: undefined,
    });
    checksum += spell?.length ?? 0;
    checksum += groupSuggestions(sug).items.length;
  }
  return checksum;
}

group("keystroke @search @quick", () => {
  bench("typing frieren, 5 prefixes N=2000 (suggest + spell + group)", () => typeWord(PREFIXES));
});

group("keystroke-worst @search @slow", () => {
  bench("single-char worst case N=2000", () => typeWord(["f"]));
});
