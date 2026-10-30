// Hill climbing calibration for ranking feedback weights on REAL app data.
//
// Runs coordinate ascent hill climbing to MAXIMIZE Top-1/MRR on the real
// anime index + learning stats from app_data.sqlite3, using the same
// getSearchSuggestions pipeline the UI calls.
//
// This is the production calibration path: bench ranks a synthetic fixture,
// this script ranks real candidates. Re-run when more select/ignore data
// accumulates (DECISIONS.md: P3 calibration waits for real data).
//
// Run: bun scripts/rank-calibrate.ts [--db <path>] [--set <json>] [--limit 8] [--pool 60]

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { buildLearningMaps, countersOf } from "@/lib/learning.utils";
import { RANKING } from "../src/config/ranking.config";
import { normalizeSearchText } from "@/lib/normalize.utils";
import { getSearchSuggestions } from "@/lib/suggestions.utils";
import type { LearningStatRow, SearchAnimeSuggestion } from "../src/types/search";

interface EvalQuery {
  query: string;
  expectedTitle: string;
  expectedAliases?: string[];
  note?: string;
}

interface EvalSet {
  queries: EvalQuery[];
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const dbPath = argument("db") ?? `${process.env.APPDATA ?? ""}/iluhaAnime/app_data.sqlite3`;
const setPath = argument("set") ?? "benches/rank-eval-queries.json";
const limit = Number(argument("limit") ?? 8);
const jsonOnly = process.argv.includes("--json");

const db = new DatabaseSync(dbPath, { readOnly: true });
const evalSet = JSON.parse(readFileSync(setPath, "utf-8")) as EvalSet;

interface AnimeRow {
  id: string;
  subtitle: string | null;
  metadata_json: string;
  value: string;
}

const animeRows = db
  .prepare(
    `SELECT id, value, subtitle, metadata_json
     FROM unified_index
     WHERE kind = 'anime' AND scope = 'anilist'`
  )
  .all() as unknown as AnimeRow[];

const animeIndex: SearchAnimeSuggestion[] = animeRows.map((row, index) => {
  const metadata = JSON.parse(row.metadata_json || "{}") as Record<string, unknown>;
  const rawId = Number(metadata.animeId ?? row.id.replace("anime:", ""));
  return {
    aliases: Array.isArray(metadata.aliases) ? (metadata.aliases as string[]) : [],
    favourite: Boolean(metadata.favourite),
    id: Number.isFinite(rawId) ? rawId : index + 1,
    score: typeof metadata.score === "number" ? metadata.score : null,
    season: typeof metadata.season === "string" ? metadata.season : null,
    seasonYear: typeof metadata.seasonYear === "number" ? metadata.seasonYear : null,
    status: row.subtitle ?? "UNKNOWN",
    title: row.value,
  };
});

const history = (
  db
    .prepare(
      `SELECT value FROM unified_index
     WHERE kind = 'history'
     ORDER BY last_used_at DESC`
    )
    .all() as unknown as Array<{ value: string }>
).map((row) => row.value);

const cutoff = Math.floor(Date.now() / 1000) - RANKING.TTL_DAYS * 86_400;
const learningRows = db
  .prepare(
    `SELECT id, kind, scope, normalized_value AS value,
            use_count AS useCount, selected_count AS selectedCount,
            ignored_count AS ignoredCount, last_used_at AS lastUsedAt
     FROM unified_index
     WHERE (use_count + selected_count + ignored_count) > 0
       AND last_used_at >= ?`
  )
  .all(cutoff) as unknown as LearningStatRow[];
const maps = buildLearningMaps(learningRows);
db.close();

const now = Date.now();
const pool = Math.max(limit, Number(argument("pool") ?? 60));

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

interface Metric { top1: number; mrr: number; found: number; }

function rankQuery(params: Params, query: string, expected: Set<string>): number {
  const candidates = getSearchSuggestions(query, {
    animeIndex,
    history,
    limit: pool,
    queryStats: maps.queryStats,
    scope: "anilist",
    suggestionStats: maps.suggestionStats,
  });
  const reranked = candidates
    .map((suggestion) => {
      const key = normalizeSearchText(suggestion.value);
      const stat = maps.suggestionStats[key];
      const counters = stat ? countersOf(stat) : null;
      let bonus = 0;
      if (counters) {
        const capped = (value: number, weight: number, cap: number) =>
          Math.min(cap, Math.max(0, value) * weight);
        const positive =
          capped(counters.selectedCount, params.selectedWeight, params.selectedCap) +
          capped(counters.useCount, params.useWeight, params.useCap);
        const negative = capped(counters.ignoredCount, params.ignoredWeight, params.ignoredCap);
        const ageHours = Math.max(0, (now - counters.lastUsedAt) / 3_600_000);
        bonus = (positive - negative) * 0.5 ** (ageHours / params.halflifeHours);
      }
      return { ...suggestion, score: suggestion.score + bonus };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.value.length - right.value.length ||
        left.value.localeCompare(right.value)
    )
    .slice(0, limit);
  return reranked.findIndex((suggestion) => expected.has(normalizeSearchText(suggestion.value))) + 1;
}

function rankWith(params: Params): Metric {
  let top1 = 0;
  let mrr = 0;
  let found = 0;
  for (const entry of evalSet.queries) {
    const expected = new Set(
      [entry.expectedTitle, ...(entry.expectedAliases ?? [])].map(normalizeSearchText)
    );
    const rank = rankQuery(params, entry.query, expected);
    if (rank > 0) {
      found += 1;
      mrr += 1 / rank;
      if (rank === 1) top1 += 1;
    }
  }
  return { top1: top1 / evalSet.queries.length, mrr: mrr / evalSet.queries.length, found: found / evalSet.queries.length };
}

// Coordinate ascent hill climbing: maximize metric(params).
function hillClimb(start: Params): { params: Params; metric: Metric; steps: number; ms: number } {
  const step = {
    selectedWeight: 5,
    selectedCap: 10,
    useWeight: 1,
    useCap: 10,
    ignoredWeight: 2,
    ignoredCap: 10,
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
  let currentMetric = rankWith(current);
  let steps = 0;
  let improved = true;
  const startMs = performance.now();
  while (improved && steps < 80) {
    improved = false;
    for (const key of Object.keys(current) as (keyof Params)[]) {
      for (const delta of [-step[key], step[key]]) {
        const next = { ...current };
        next[key] = Math.max(floor[key], next[key] + delta);
        const metric = rankWith(next);
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

const baseline = rankWith(BASE_PARAMS);
console.log("BASELINE (current RANKING params, real data):");
console.log(JSON.stringify(BASE_PARAMS, null, 2));
console.log(`  Top-1=${baseline.top1.toFixed(3)} MRR=${baseline.mrr.toFixed(3)} found=${baseline.found.toFixed(3)} queries=${evalSet.queries.length}`);

const result = hillClimb(BASE_PARAMS);
console.log("");
console.log("HILL CLIMB (maximize Top-1/MRR, real data):");
console.log(`  steps=${result.steps} ms=${result.ms.toFixed(0)}`);
console.log(JSON.stringify(result.params, null, 2));
console.log(`  Top-1=${result.metric.top1.toFixed(3)} MRR=${result.metric.mrr.toFixed(3)} found=${result.metric.found.toFixed(3)}`);
console.log(`  delta Top-1=${(result.metric.top1 - baseline.top1).toFixed(3)} MRR=${(result.metric.mrr - baseline.mrr).toFixed(3)}`);

if (result.metric.top1 > baseline.top1 + 1e-6 || result.metric.mrr > baseline.mrr + 1e-6) {
  console.log("");
  console.log("RECOMMENDATION: apply new params to src/config/ranking.config.ts");
} else {
  console.log("");
  console.log("RECOMMENDATION: no improvement; keep current params");
}

if (!jsonOnly) {
  console.log("");
  console.log("Per-query comparison:");
  for (const entry of evalSet.queries) {
    const expected = new Set(
      [entry.expectedTitle, ...(entry.expectedAliases ?? [])].map(normalizeSearchText)
    );
    const baseRank = rankQuery(BASE_PARAMS, entry.query, expected);
    const newRank = rankQuery(result.params, entry.query, expected);
    const mark = newRank === 1 ? "OK " : newRank > 0 ? `#${newRank}` : "MISS";
    const change = baseRank === newRank ? "" : ` (was #${baseRank})`;
    console.log(`${mark.padEnd(4)} ${entry.query.padEnd(40)} -> ${entry.expectedTitle}${change}`);
  }
}
