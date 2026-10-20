import { bench, group } from "@pmndrs/labs";
// End-to-end suggestion pipeline with learning that actually matches the
// fixture. `suggest-pipeline` keys its stats on strings that never equal a
// normalized title, so the feedback path was never measured there. This file
// keys counters on real normalized titles and history entries, at 0% / 1% /
// 10% learning density, cold (fresh index reference) and warm.
//
// Budget (Ryzen 7 5800X / node 26): warm 5k at 10% learning <= 40 ms per 5
// queries; learning adds <= 10% over the same index with no counters; cold is
// <= 3x warm. Regression threshold is labs minDelta 5%.

import { buildLearningMaps } from "../../src/lib/ranking/learning.utils";
import { normalizeSearchText } from "../../src/lib/search/normalize.utils";
import { getSearchSuggestions } from "../../src/lib/search/suggestions.utils";
import type { LearningStatRow, SearchAnimeSuggestion } from "../../src/types/search";

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

const QUERIES = ["fr", "fri", "frieren", "naruto ship", "attack", "steins"];
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

function makeIndex(count: number): SearchAnimeSuggestion[] {
  const out: SearchAnimeSuggestion[] = [];
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let index = 0; index < count; index++) {
    const wordCount = 1 + Math.floor(random() * 3);
    const parts: string[] = [];
    for (let word = 0; word < wordCount; word++) {
      parts.push(WORDS[Math.floor(random() * WORDS.length)]!);
    }
    out.push({
      aliases: [parts.toReversed().join(" ")],
      favourite: index % 50 === 0,
      id: index,
      score: 70 + (index % 30),
      season: "WINTER",
      seasonYear: 2020 + (index % 6),
      status: "COMPLETED",
      title: `${parts.join(" ")} ${index}`,
    });
  }
  return out;
}

function makeLearningRows(index: SearchAnimeSuggestion[], density: number): LearningStatRow[] {
  if (density <= 0) return [];
  const step = Math.max(1, Math.round(1 / density));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rows: LearningStatRow[] = [];
  for (let position = 0; position < index.length; position += step) {
    const anime = index[position]!;
    rows.push({
      id: `anime:${anime.id}`,
      ignoredCount: 0,
      kind: "anime",
      lastUsedAt: nowSeconds,
      scope: "anilist",
      selectedCount: 1 + (position % 3),
      useCount: 2 + (position % 5),
      value: normalizeSearchText(anime.title),
    });
  }
  for (const entry of HISTORY) {
    rows.push({
      id: `history:torrent:${normalizeSearchText(entry)}`,
      ignoredCount: 0,
      kind: "history",
      lastUsedAt: nowSeconds,
      scope: "torrent",
      selectedCount: 1,
      useCount: 2,
      value: normalizeSearchText(entry),
    });
  }
  return rows;
}

const INDEX_1K = makeIndex(1_000);
const INDEX_5K = makeIndex(5_000);
const INDEX_20K = makeIndex(20_000);

const NONE_1K = buildLearningMaps([], Date.now());
const LEARNED_1K = buildLearningMaps(makeLearningRows(INDEX_1K, 0.1), Date.now());
const NONE_5K = buildLearningMaps([], Date.now());
const LIGHT_5K = buildLearningMaps(makeLearningRows(INDEX_5K, 0.01), Date.now());
const LEARNED_5K = buildLearningMaps(makeLearningRows(INDEX_5K, 0.1), Date.now());
const LEARNED_20K = buildLearningMaps(makeLearningRows(INDEX_20K, 0.1), Date.now());

interface Arm {
  index: SearchAnimeSuggestion[];
  maps: ReturnType<typeof buildLearningMaps>;
}

function runQueries(arm: Arm): number {
  let checksum = 0;
  for (const query of QUERIES) {
    const suggestions = getSearchSuggestions(query, {
      animeIndex: arm.index,
      history: HISTORY,
      limit: 8,
      queryStats: arm.maps.queryStats,
      scope: "anilist",
      suggestionStats: arm.maps.suggestionStats,
    });
    checksum += suggestions.length;
    for (const suggestion of suggestions) checksum += suggestion.score;
  }
  return checksum;
}

group("suggest-learning @search @ranking @quick", () => {
  bench("1k no learning (control)", () => runQueries({ index: INDEX_1K, maps: NONE_1K }));
  bench("1k 10% learned", () => runQueries({ index: INDEX_1K, maps: LEARNED_1K }));
  bench("5k no learning (control)", () => runQueries({ index: INDEX_5K, maps: NONE_5K }));
  bench("5k 1% learned", () => runQueries({ index: INDEX_5K, maps: LIGHT_5K }));
  bench("5k 10% learned", () => runQueries({ index: INDEX_5K, maps: LEARNED_5K }));
  bench("5k 10% learned cold index ref", () =>
    runQueries({ index: [...INDEX_5K], maps: LEARNED_5K }));
});

group("suggest-learning-scale @search @ranking @slow", () => {
  bench("20k 10% learned", () => runQueries({ index: INDEX_20K, maps: LEARNED_20K }));
});
