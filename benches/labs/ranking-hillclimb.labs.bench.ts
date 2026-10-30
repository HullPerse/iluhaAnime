import { bench, group } from "@pmndrs/labs";

// Hill climbing (maximize relevance) vs gradient descent (minimize batch cost).
// BASELINE ONLY — no implementation change yet. These benches measure the
// current behavior so a later hill-climbing / gradient-descent pass can be
// accepted only on a real, measured improvement.
//
// Budget (Ryzen 7 5800X / node 26): one hill-climbing pass over 7 ranking
// parameters on a deterministic 48-query eval set must finish well under a
// labs block; sub-5% deltas are noise on this host.
// Regression threshold is labs minDelta 5%.
// Checksums returned so labs can detect dead code elimination.

import { buildLearningMaps, countersOf } from "@/lib/learning.utils";
import { RANKING } from "../../src/config/ranking.config";
import { normalizeSearchText } from "@/lib/normalize.utils";

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

// Deterministic eval fixture: 48 queries, each expecting one title.
// Half are "easy" (expected already has the highest base score) and half are
// "hard" (expected has a lower base score and can only reach #1 through the
// feedback bonus, so the metric is a real function of the params).
function hardCase(query: string, expected: string): { query: string; expected: string; candidates: FixtureCandidate[]; counters: FixtureCounters } {
  return {
    query,
    expected,
    candidates: [
      { value: expected, score: 20, aliases: [], favourite: false, id: 1, season: null, seasonYear: null, status: "FINISHED", title: expected },
      { value: `${expected} Movie`, score: 35, aliases: [], favourite: false, id: 2, season: null, seasonYear: null, status: "FINISHED", title: `${expected} Movie` },
      { value: `${expected} OVA`, score: 45, aliases: [], favourite: false, id: 3, season: null, seasonYear: null, status: "FINISHED", title: `${expected} OVA` },
      { value: `Other ${expected}`, score: 55, aliases: [], favourite: false, id: 4, season: null, seasonYear: null, status: "FINISHED", title: `Other ${expected}` },
    ],
    counters: { selectedCount: 1, useCount: 2, ignoredCount: 0 },
  };
}

function easyCase(query: string, expected: string): { query: string; expected: string; candidates: FixtureCandidate[]; counters: FixtureCounters } {
  return {
    query,
    expected,
    candidates: [
      { value: expected, score: 80, aliases: [], favourite: false, id: 1, season: null, seasonYear: null, status: "FINISHED", title: expected },
      { value: `${expected} Movie`, score: 75, aliases: [], favourite: false, id: 2, season: null, seasonYear: null, status: "FINISHED", title: `${expected} Movie` },
      { value: `${expected} OVA`, score: 70, aliases: [], favourite: false, id: 3, season: null, seasonYear: null, status: "FINISHED", title: `${expected} OVA` },
      { value: `Other ${expected}`, score: 65, aliases: [], favourite: false, id: 4, season: null, seasonYear: null, status: "FINISHED", title: `Other ${expected}` },
    ],
    counters: { selectedCount: 1, useCount: 2, ignoredCount: 0 },
  };
}

const TITLES = [
  "Chainsaw Man", "HUNTER×HUNTER (2011)", "Ping Pong THE ANIMATION", "Jujutsu Kaisen",
  "Steins;Gate", "Neon Genesis Evangelion", "Cowboy Bebop", "AKIRA", "Ghost in the Shell",
  "Fullmetal Alchemist: Brotherhood", "Death Note", "Attack on Titan", "My Hero Academia",
  "Demon Slayer", "Tokyo Ghoul", "Code Geass", "Fate/stay night", "Sword Art Online",
  "One Piece", "Naruto", "Bleach", "Fairy Tail", "Haikyu!!", "Kuroko no Basket",
];

const EVAL: Array<{ query: string; expected: string; candidates: FixtureCandidate[]; counters: FixtureCounters }> = [];
for (let i = 0; i < TITLES.length; i++) {
  const title = TITLES[i];
  const query = title.slice(0, 5);
  if (i % 2 === 0) EVAL.push(easyCase(query, title));
  else EVAL.push(hardCase(query, title));
}

// Inject counters into candidates so measure() can build learning maps.
for (const c of EVAL) {
  for (const [index, cand] of c.candidates.entries()) {
    cand._counters = index === 0 ? c.counters : { selectedCount: 0, useCount: 0, ignoredCount: 0 };
  }
}

interface Metric { top1: number; mrr: number; found: number; }

function rankWith(params: Params, candidates: FixtureCandidate[], maps: ReturnType<typeof buildLearningMaps>): FixtureCandidate[] {
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
  const rows = EVAL.flatMap(({ candidates }) =>
    candidates.map((entry) => ({
      id: `fixture:${entry.value}`,
      ignoredCount: entry._counters?.ignoredCount ?? 0,
      kind: "anime",
      lastUsedAt: Math.floor(NOW / 1000),
      scope: "anilist",
      selectedCount: entry._counters?.selectedCount ?? 0,
      useCount: entry._counters?.useCount ?? 0,
      value: normalizeSearchText(entry.value),
    }))
  );
  const maps = buildLearningMaps(rows, NOW);
  for (const { expected, candidates } of EVAL) {
    const ranked = rankWith(params, candidates, maps);
    const rank = ranked.findIndex((entry) => normalizeSearchText(entry.value) === normalizeSearchText(expected)) + 1;
    if (rank > 0) {
      found += 1;
      mrr += 1 / rank;
      if (rank === 1) top1 += 1;
    }
  }
  return { top1: top1 / EVAL.length, mrr: mrr / EVAL.length, found: found / EVAL.length };
}

// Coordinate ascent hill climbing: maximize metric(params).
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

group("ranking-hillclimb @ranking @quick", () => {
  bench("baseline metric current params", () => {
    const m = measure(BASE_PARAMS);
    return Math.round((m.top1 * 1000 + m.mrr * 1000 + m.found * 100) * 1000);
  });

  bench("hill climbing pass maximize metric", () => {
    const result = hillClimb(BASE_PARAMS);
    return Math.round((result.metric.top1 * 1000 + result.metric.mrr * 1000 + result.metric.found * 100 + result.steps) * 1000) + Math.round(result.ms);
  });
});
