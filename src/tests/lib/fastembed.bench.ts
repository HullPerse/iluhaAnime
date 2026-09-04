import { bench, describe } from "vitest";

import { parseIntent } from "@/lib/intentParser.utils";
import { normalizeSearchText } from "@/lib/normalize.utils";
import { getSearchSuggestions } from "@/lib/search.suggestions";
import { semanticScore } from "@/lib/semantic.utils";
import { buildSymSpellFromTitles } from "@/lib/symspell.utils";
import type { SearchAnimeSuggestion } from "@/types/search";

function makeAnimeIndex(count: number): SearchAnimeSuggestion[] {
  const titles = [
    "Frieren: Beyond Journey's End",
    "Attack on Titan",
    "Steins;Gate",
    "Жёсткий тест",
    "Магия и меч",
  ];
  const out: SearchAnimeSuggestion[] = [];
  for (let i = 0; i < count; i++)
    out.push({
      id: i,
      title: `${titles[i % titles.length]} ${i}`,
      aliases: [],
      status: "COMPLETED",
      score: 80,
      favourite: i % 5 === 0,
      season: null,
      seasonYear: null,
    });
  return out;
}


const idx2k = makeAnimeIndex(2000);
const history = ["frieren 1080p", "attack on titan"];
const sym = buildSymSpellFromTitles(idx2k.map((a) => a.title));
const titles2k = idx2k.map((a) => a.title);

describe("fastembed PR bench - personal", () => {
  bench("lexical only 2k (getSearchSuggestions)", () => {
    getSearchSuggestions("frieren", { animeIndex: idx2k, history, limit: 8 });
  });

  bench("lexical + symspell correction (friren typo)", () => {
    getSearchSuggestions("friren", { animeIndex: idx2k, history, limit: 8 });
  });

  bench("lexical + TF-IDF semantic (time travel)", () => {
    // semantic triggers only when lexical < limit and query len>=3
    getSearchSuggestions("time travel", { animeIndex: idx2k, history, limit: 8 });
  });

  bench("semanticScore TF-IDF single", () => {
    semanticScore("time travel romance", "Steins;Gate time travel", titles2k);
  });

  bench("symSpell correct single word", () => {
    sym.suggest("friren");
  });

  bench("intentParser year:2024 studio:MAPPA", () => {
    parseIntent("year:2024 studio:MAPPA frieren");
  });


  bench("normalize 1k Cyrillic", () => {
    for (let i = 0; i < 1000; i++) {
      normalizeSearchText("ЖЁсткий Тест café");
    }
  });
});
