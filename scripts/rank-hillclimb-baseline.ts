// Baseline measurement for hill-climbing (maximize relevance) before any
// implementation change. Prints Top-1 / MRR with the current RANKING params,
// then runs a coordinate-ascent hill climb and prints the resulting metric.
//
// Run: bun scripts/rank-hillclimb-baseline.ts

import { buildLearningMaps, countersOf } from "../src/lib/ranking/learning.utils";
import { RANKING } from "../src/lib/ranking/ranking.config";
import { normalizeSearchText } from "../src/lib/search/normalize.utils";

const NOW = 1_700_000_000_000;
const LIMIT = 8;

interface FixtureCounters {
  selectedCount: number;
  useCount: number;
  ignoredCount: number;
}

interface FixtureCandidate {
  value: string;
  score: number | null;
  aliases: string[];
  favourite: boolean;
  id: number;
  season: string | null;
  seasonYear: number | null;
  status: string;
  title: string;
  _counters?: FixtureCounters;
}

interface Params {
  selectedWeight: number;
  selectedCap: number;
  useWeight: number;
  useCap: number;
  ignoredWeight: number;
  ignoredCap: number;
  halflifeHours: number;
}

const BASE_PARAMS: Params = {
  selectedWeight: RANKING.FEEDBACK_SELECTED_WEIGHT,
  selectedCap: RANKING.FEEDBACK_SELECTED_CAP,
  useWeight: RANKING.FEEDBACK_USE_WEIGHT,
  useCap: RANKING.FEEDBACK_USE_CAP,
  ignoredWeight: RANKING.FEEDBACK_IGNORED_WEIGHT,
  ignoredCap: RANKING.FEEDBACK_IGNORED_CAP,
  halflifeHours: RANKING.FEEDBACK_HALFLIFE_HOURS,
};

interface Case {
  query: string;
  expected: string;
  candidates: FixtureCandidate[];
  counters: FixtureCounters;
}

function hardCase(query: string, expected: string): Case {
  return {
    query, expected,
    counters: { selectedCount: 1, useCount: 2, ignoredCount: 0 },
    candidates: [
      { value: expected, score: 20, aliases: [], favourite: false, id: 1, season: null, seasonYear: null, status: "FINISHED", title: expected },
      { value: `${expected} Movie`, score: 35, aliases: [], favourite: false, id: 2, season: null, seasonYear: null, status: "FINISHED", title: `${expected} Movie` },
      { value: `${expected} OVA`, score: 45, aliases: [], favourite: false, id: 3, season: null, seasonYear: null, status: "FINISHED", title: `${expected} OVA` },
      { value: `Other ${expected}`, score: 55, aliases: [], favourite: false, id: 4, season: null, seasonYear: null, status: "FINISHED", title: `Other ${expected}` },
    ],
  };
}

function easyCase(query: string, expected: string): Case {
  return {
    query, expected,
    counters: { selectedCount: 1, useCount: 2, ignoredCount: 0 },
    candidates: [
      { value: expected, score: 80, aliases: [], favourite: false, id: 1, season: null, seasonYear: null, status: "FINISHED", title: expected },
      { value: `${expected} Movie`, score: 75, aliases: [], favourite: false, id: 2, season: null, seasonYear: null, status: "FINISHED", title: `${expected} Movie` },
      { value: `${expected} OVA`, score: 70, aliases: [], favourite: false, id: 3, season: null, seasonYear: null, status: "FINISHED", title: `${expected} OVA` },
      { value: `Other ${expected}`, score: 65, aliases: [], favourite: false, id: 4, season: null, seasonYear: null, status: "FINISHED", title: `Other ${expected}` },
    ],
  };
}

const TITLES = [
  "Chainsaw Man", "HUNTER×HUNTER (2011)", "Ping Pong THE ANIMATION", "Jujutsu Kaisen",
  "Steins;Gate", "Neon Genesis Evangelion", "Cowboy Bebop", "AKIRA", "Ghost in the Shell",
  "Fullmetal Alchemist: Brotherhood", "Death Note", "Attack on Titan", "My Hero Academia",
  "Demon Slayer", "Tokyo Ghoul", "Code Geass", "Fate/stay night", "Sword Art Online",
  "One Piece", "Naruto", "Bleach", "Fairy Tail", "Haikyu!!", "Kuroko no Basket",
];

const EVAL: Case[] = [];
for (let i = 0; i < TITLES.length; i++) {
  const title = TITLES[i];
  const _query = title.slice(0, 5);
  EVAL.push(i % 2 === 0 ? easyCase(_query, title) : hardCase(_query, title));
}

for (const c of EVAL) {
  for (const [index, cand] of c.candidates.entries()) {
    cand._counters = index === 0 ? c.counters : { selectedCount: 0, useCount: 0, ignoredCount: 0 };
  }
}

interface Metric { top1: number; mrr: number; found: number; }

function rankWith(params: Params, candidates: FixtureCandidate[]): FixtureCandidate[] {
  const rows = candidates.map((entry) => ({
    id: `fixture:${entry.value}`,
    ignoredCount: entry._counters?.ignoredCount ?? 0,
    kind: "anime",
    lastUsedAt: Math.floor(NOW / 1000),
    scope: "anilist",
    selectedCount: entry._counters?.selectedCount ?? 0,
    useCount: entry._counters?.useCount ?? 0,
    value: normalizeSearchText(entry.value),
  }));
  const maps = buildLearningMaps(rows, NOW);
  return candidates
    .map((candidate) => {
      const stat = maps.suggestionStats[normalizeSearchText(candidate.value)];
      const counters = stat ? countersOf(stat) : null;
      let bonus = 0;
      if (counters) {
        const capped = (value: number, weight: number, cap: number) => Math.min(cap, Math.max(0, value) * weight);
        const positive =
          capped(counters.selectedCount, params.selectedWeight, params.selectedCap) +
          capped(counters.useCount, params.useWeight, params.useCap);
        const negative = capped(counters.ignoredCount, params.ignoredWeight, params.ignoredCap);
        const ageHours = Math.max(0, (NOW - counters.lastUsedAt) / 3_600_000);
        bonus = (positive - negative) * 0.5 ** (ageHours / params.halflifeHours);
      }
      return { ...candidate, score: (candidate.score ?? 0) + bonus };
    })
    .sort(
      (left, right) =>
        (right.score ?? 0) - (left.score ?? 0) ||
        left.value.length - right.value.length ||
        left.value.localeCompare(right.value)
    )
    .slice(0, LIMIT);
}

function measure(params: Params): Metric {
  let top1 = 0;
  let mrr = 0;
  let found = 0;
  for (const { expected, candidates } of EVAL) {
    const ranked = rankWith(params, candidates);
    const rank = ranked.findIndex((entry) => normalizeSearchText(entry.value) === normalizeSearchText(expected)) + 1;
    if (rank > 0) {
      found += 1;
      mrr += 1 / rank;
      if (rank === 1) top1 += 1;
    }
  }
  return { top1: top1 / EVAL.length, mrr: mrr / EVAL.length, found: found / EVAL.length };
}

function hillClimb(start: Params): { params: Params; metric: Metric; steps: number; ms: number } {
  const step = {
    selectedWeight: 15,
    selectedCap: 20,
    useWeight: 2,
    useCap: 20,
    ignoredWeight: 2,
    ignoredCap: 15,
    halflifeHours: 60,
  } as const;
  const floor = {
    selectedWeight: 1,
    selectedCap: 5,
    useWeight: 1,
    useCap: 5,
    ignoredWeight: 1,
    ignoredCap: 5,
    halflifeHours: 30,
  } as const;
  let current = { ...start };
  let currentMetric = measure(current);
  let steps = 0;
  let improved = true;
  const startMs = performance.now();
  while (improved && steps < 60) {
    improved = false;
    for (const key of Object.keys(current) as (keyof Params)[]) {
      for (const delta of [-step[key], step[key]]) {
        const next = { ...current };
        next[key] = Math.max(floor[key], next[key] + delta);
        const metric = measure(next);
        const better =
          metric.mrr > currentMetric.mrr + 1e-9 ||
          (Math.abs(metric.mrr - currentMetric.mrr) <= 1e-9 && metric.top1 > currentMetric.top1);
        if (better) {
          current = next;
          currentMetric = metric;
          improved = true;
          steps += 1;
        }
      }
    }
  }
  return { params: current, metric: currentMetric, steps, ms: performance.now() - startMs };
}

const baseline = measure(BASE_PARAMS);
console.log("BASELINE (current RANKING params):");
console.log(JSON.stringify(BASE_PARAMS, null, 2));
console.log(`  Top-1=${baseline.top1.toFixed(3)} MRR=${baseline.mrr.toFixed(3)} found=${baseline.found.toFixed(3)}`);

const result = hillClimb(BASE_PARAMS);
console.log("");
console.log("HILL CLIMB (maximize Top-1/MRR):");
console.log(`  steps=${result.steps} ms=${result.ms.toFixed(1)}`);
console.log(JSON.stringify(result.params, null, 2));
console.log(`  Top-1=${result.metric.top1.toFixed(3)} MRR=${result.metric.mrr.toFixed(3)} found=${result.metric.found.toFixed(3)}`);
console.log(`  delta Top-1=${(result.metric.top1 - baseline.top1).toFixed(3)} MRR=${(result.metric.mrr - baseline.mrr).toFixed(3)}`);
