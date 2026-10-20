// Offline quality evaluation for the suggestion ranking.
// Reads a hand-checked (or draft) query set, rebuilds the anime index and the
// learning projection from the real app database, and reports Top-1 / Top-3 /
// MRR@N. The database is opened READONLY; the engine itself is the same pure
// function the UI calls.
//
// Run: bun scripts/rank-eval.ts [--db <path>] [--set <json>] [--limit 8] [--pool 60] [--json]
//
// Reports the new feedback formula and the replaced TS formula on the same
// candidate pool, per category and overall. The old arm is harness-only.
//
// Query set shape:
// { "queries": [{ "query": "frieren", "expectedTitle": "Sousou no Frieren",
//                 "expectedAliases": ["Frieren: Beyond Journey's End"] }] }

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { feedbackScore } from "../src/lib/ranking/feedback.utils";
import { buildLearningMaps, countersOf } from "../src/lib/ranking/learning.utils";
import { RANKING } from "../src/lib/ranking/ranking.config";
import { normalizeSearchText } from "../src/lib/search/normalize.utils";
import { getSearchSuggestions } from "../src/lib/search/suggestions.utils";
import type {
  LearningStatRow,
  SearchAnimeSuggestion,
  SearchQueryStat,
  SearchSuggestion,
} from "../src/types/search";

interface EvalQuery {
  query: string;
  expectedTitle: string;
  expectedAliases?: string[];
  note?: string;
}

interface EvalSet {
  version: number;
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

interface EvalHit {
  query: string;
  expected: string;
  category: string;
  rank: number;
  top: string[];
}

type Formula = "new" | "old";

interface FormulaMetrics {
  mrr: number;
  top1: number;
  top3: number;
}

const now = Date.now();
const pool = Math.max(limit, Number(argument("pool") ?? 60));

/**
 * The old TS formula (deleted in the ranking extraction), reproduced here only
 * for the A/B arm. It is applied to the same candidate pool as the new model,
 * so the comparison isolates the formula, not recall.
 */
function oldTsBoost(
  stat: { count: number; lastUsedAt: number; selectedCount: number; ignoredCount?: number },
  at: number
): number {
  const ageHours = Math.max(0, (at - stat.lastUsedAt) / 3_600_000);
  const recency = ageHours <= 24 ? 60 : ageHours <= 168 ? 30 : ageHours <= 720 ? 15 : 6;
  return (
    Math.min(120, stat.count * 2) +
    recency +
    Math.min(80, stat.selectedCount * 20) -
    Math.min(60, (stat.ignoredCount ?? 0) * 10)
  );
}

function feedbackOf(suggestion: SearchSuggestion, formula: Formula): number {
  const key = normalizeSearchText(suggestion.value);
  const stats: SearchQueryStat[] = [];
  const merged = maps.suggestionStats[key];
  if (merged) stats.push(merged);
  if (suggestion.kind === "history") {
    const scoped = maps.queryStats[`anilist:${key}`] ?? maps.queryStats[key];
    if (scoped) stats.push(scoped);
  }
  let total = 0;
  for (const stat of stats) {
    total += formula === "old" ? oldTsBoost(stat, now) : feedbackScore(countersOf(stat), now);
  }
  return total;
}

function rankWith(query: string, expected: Set<string>, formula: Formula): EvalHit {
  const candidates = getSearchSuggestions(query, {
    animeIndex,
    history,
    limit: pool,
    queryStats: maps.queryStats,
    scope: "anilist",
    suggestionStats: maps.suggestionStats,
  });
  const reranked = candidates
    .map((suggestion) => ({
      ...suggestion,
      score: suggestion.score - feedbackOf(suggestion, "new") + feedbackOf(suggestion, formula),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.value.length - right.value.length ||
        left.value.localeCompare(right.value)
    )
    .slice(0, limit);
  const rank =
    reranked.findIndex((suggestion) => expected.has(normalizeSearchText(suggestion.value))) + 1;
  return {
    category: "",
    expected: "",
    query,
    rank,
    top: reranked.slice(0, 3).map((suggestion) => suggestion.value),
  };
}

function summarize(hits: EvalHit[]): FormulaMetrics {
  const total = hits.length || 1;
  return {
    mrr: hits.reduce((sum, hit) => sum + (hit.rank > 0 ? 1 / hit.rank : 0), 0) / total,
    top1: hits.filter((hit) => hit.rank === 1).length / total,
    top3: hits.filter((hit) => hit.rank > 0 && hit.rank <= 3).length / total,
  };
}

const hitsNew: EvalHit[] = [];
const hitsOld: EvalHit[] = [];
const started = performance.now();
for (const entry of evalSet.queries) {
  const expected = new Set(
    [entry.expectedTitle, ...(entry.expectedAliases ?? [])].map(normalizeSearchText)
  );
  const fresh = rankWith(entry.query, expected, "new");
  const legacy = rankWith(entry.query, expected, "old");
  hitsNew.push({
    ...fresh,
    category: entry.note ?? "uncategorised",
    expected: entry.expectedTitle,
  });
  hitsOld.push({
    ...legacy,
    category: entry.note ?? "uncategorised",
    expected: entry.expectedTitle,
  });
}
const elapsed = performance.now() - started;

const metricsNew = summarize(hitsNew);
const metricsOld = summarize(hitsOld);
const categories = [...new Set(hitsNew.map((hit) => hit.category))].map((category) => {
  const fresh = hitsNew.filter((hit) => hit.category === category);
  const legacy = hitsOld.filter((hit) => hit.category === category);
  return {
    category,
    new: summarize(fresh),
    old: summarize(legacy),
    total: fresh.length,
  };
});
const changed = hitsNew
  .map((hit, index) => ({ next: hit.rank, old: hitsOld[index]?.rank ?? 0, query: hit.query }))
  .filter((entry) => entry.next !== entry.old);

const report = {
  animeIndex: animeIndex.length,
  dbPath,
  elapsedMs: elapsed,
  history: history.length,
  learningRows: learningRows.length,
  limit,
  pool,
  formulas: { new: metricsNew, old: metricsOld },
  categories,
  rankChanges: changed,
  queries: { new: hitsNew, old: hitsOld },
  setPath,
  total: hitsNew.length,
};

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `queries=${report.total} anime=${animeIndex.length} history=${history.length} learning=${learningRows.length} pool=${pool}`
  );
  console.log(
    `new: top1=${(metricsNew.top1 * 100).toFixed(1)}% top3=${(metricsNew.top3 * 100).toFixed(1)}% MRR=${metricsNew.mrr.toFixed(3)}`
  );
  console.log(
    `old: top1=${(metricsOld.top1 * 100).toFixed(1)}% top3=${(metricsOld.top3 * 100).toFixed(1)}% MRR=${metricsOld.mrr.toFixed(3)}`
  );
  console.log("");
  for (const entry of categories) {
    console.log(
      `${entry.category.padEnd(18)} n=${entry.total.toString().padEnd(3)} new ${entry.new.top1 * 100}/${entry.new.top3 * 100} old ${entry.old.top1 * 100}/${entry.old.top3 * 100}`
    );
  }
  console.log("");
  for (const hit of hitsNew) {
    const mark = hit.rank === 1 ? "OK " : hit.rank > 0 ? `#${hit.rank}` : "MISS";
    console.log(
      `${mark.padEnd(4)} ${hit.query.padEnd(36)} -> ${hit.expected}  [${hit.top.join(" | ")}]`
    );
  }
  if (changed.length > 0) {
    console.log("");
    console.log(`rank changes (new vs old): ${changed.length}`);
    for (const entry of changed) {
      console.log(`  ${entry.query}: new #${entry.next || "-"} vs old #${entry.old || "-"}`);
    }
  }
}
