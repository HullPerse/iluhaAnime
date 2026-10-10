import { bench, group } from "@pmndrs/labs";

import { LazySpellIndex } from "../../src/lib/search/lazySpellIndex.utils";
import { normalizeSearchText } from "../../src/lib/search/normalize.utils";
import { suggestSpelling } from "../../src/lib/search/suggestions.utils";
import { buildSymSpellFromTitles, normalizedSpellWords } from "../../src/lib/search/symspell.utils";
import type { SearchAnimeSuggestion } from "../../src/types/search";

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

const INDEX_1K = makeIndex(1000);
const INDEX_4K = makeIndex(4000);
const INDEX_8K = makeIndex(8000);
const INDEX_16K = makeIndex(16000);
const INDEX_32K = makeIndex(32000);

const TITLES_1K = INDEX_1K.map((a) => a.title);
const TITLES_4K = INDEX_4K.map((a) => a.title);
const TITLES_8K = INDEX_8K.map((a) => a.title);
const TITLES_16K = INDEX_16K.map((a) => a.title);
const TITLES_32K = INDEX_32K.map((a) => a.title);

const QUERY = "firen";

const WORDS_8K = normalizedSpellWords(TITLES_8K);
const WORDS_32K = normalizedSpellWords(TITLES_32K);

group("did-you-mean @didyoumean @slow", () => {
  bench("cold: build symspell from titles N=1k", function* buildSymspell1k() {
    const titles = TITLES_1K;
    const built = yield () => buildSymSpellFromTitles(titles);
    return built.size();
  });

  bench("cold: build symspell from titles N=4k", function* buildSymspell4k() {
    const titles = TITLES_4K;
    const built = yield () => buildSymSpellFromTitles(titles);
    return built.size();
  });

  bench("cold: build symspell from titles N=8k", function* buildSymspell8k() {
    const titles = TITLES_8K;
    const built = yield () => buildSymSpellFromTitles(titles);
    return built.size();
  });

  bench("cold: build symspell from titles N=16k", function* buildSymspell16k() {
    const titles = TITLES_16K;
    const built = yield () => buildSymSpellFromTitles(titles);
    return built.size();
  });

  bench("cold: build symspell from titles N=32k", function* buildSymspell32k() {
    const titles = TITLES_32K;
    const built = yield () => buildSymSpellFromTitles(titles);
    return built.size();
  });

  bench("cold: build plain normalized word set N=8k (cheaper dict)", function* buildPlainWordSet8k() {
    const titles = TITLES_8K;
    return yield () => {
      const set = new Set<string>();
      for (const title of titles) {
        for (const word of normalizeSearchText(title).split(" ")) {
          if (word.length >= 3) set.add(word);
        }
      }
      return set.size;
    };
  });

  bench("warm: suggestSpelling N=8k (index already cached)", function* warmSuggestSpelling8k() {
    const index = INDEX_8K;
    suggestSpelling(QUERY, { history: HISTORY, animeIndex: index });
    return yield () => suggestSpelling(QUERY, { history: HISTORY, animeIndex: index })?.length ?? 0;
  });

  bench("cold: fresh index copy N=8k only (control)", function* copyFreshIndex8k() {
    const base = INDEX_8K;
    let counter = 0;
    return yield () => {
      const fresh = base.map((anime, i) =>
        i === 0 ? { ...anime, title: `${anime.title} ${counter++}` } : anime
      );
      return fresh.length;
    };
  });

  bench("cold: suggestSpelling N=8k (fresh index, real first call)", function* coldSuggestSpelling8k() {
    const base = INDEX_8K;
    let counter = 0;
    return yield () => {
      const fresh = base.map((anime, i) =>
        i === 0 ? { ...anime, title: `${anime.title} ${counter++}` } : anime
      );
      return suggestSpelling(QUERY, { history: HISTORY, animeIndex: fresh })?.length ?? 0;
    };
  });

  bench("cold: suggestSpelling N=16k (fresh index, real first call)", function* coldSuggestSpelling16k() {
    const base = INDEX_16K;
    let counter = 0;
    return yield () => {
      const fresh = base.map((anime, i) =>
        i === 0 ? { ...anime, title: `${anime.title} ${counter++}` } : anime
      );
      return suggestSpelling(QUERY, { history: HISTORY, animeIndex: fresh })?.length ?? 0;
    };
  });

  // After: prewarm builds the index in 500-word idle slices, so the first
  // real lookup finds it ready instead of paying the full cold cost.
  bench("after: prewarm pump N=8k in 500-word idle slices", function* prewarmPump8k() {
    return yield () => {
      const index = new LazySpellIndex(WORDS_8K);
      let slices = 0;
      let done = false;
      while (!done) {
        done = index.pump(500);
        slices++;
      }
      return slices;
    };
  });

  bench("after: warm first query N=8k (prewarm finished)", function* warmFirstQuery8k() {
    const index = new LazySpellIndex(WORDS_8K);
    index.pump(Number.MAX_SAFE_INTEGER);
    return yield () => index.suggestMany(QUERY, 1).length;
  });

  bench("after: warm first query N=32k (prewarm finished)", function* warmFirstQuery32k() {
    const index = new LazySpellIndex(WORDS_32K);
    index.pump(Number.MAX_SAFE_INTEGER);
    return yield () => index.suggestMany(QUERY, 1).length;
  });
});
