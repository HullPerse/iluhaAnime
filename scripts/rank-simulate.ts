// SIMULATED calibration harness for the feedback formula.
//
// This does NOT use real user clicks. It generates a rank-biased click stream
// over a self-labeled hard set: for every anime title that has sequels or
// movies (a "family"), a six-character prefix of the base title is expected to
// resolve to that base. The labels are a judgement call, not user preference.
//
// The point is to check mechanics and sensitivity: does a select lift a title,
// does an ignore sink it, do caps and the half-life converge, and how do the
// old and new formulas compare on the same action stream. Production constants
// are never changed by this script.
//
// Run: bun scripts/rank-simulate.ts [--db <path>] [--rounds 12] [--json]

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { buildLearningMaps, countersOf } from "../src/lib/ranking/learning.utils";
import { RANKING } from "../src/lib/ranking/ranking.config";
import type { RankingCounters } from "../src/lib/ranking/types";
import { normalizeSearchText } from "../src/lib/search/normalize.utils";
import { getSearchSuggestions } from "../src/lib/search/suggestions.utils";
import type { LearningStatRow, SearchAnimeSuggestion, SearchSuggestion } from "../src/types/search";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const dbPath = argument("db") ?? `${process.env.APPDATA ?? ""}/iluhaAnime/app_data.sqlite3`;
const setPath = argument("set") ?? "benches/rank-eval-queries.json";
const rounds = Math.max(1, Number(argument("rounds") ?? 12));
const jsonOnly = process.argv.includes("--json");
const LIMIT = 8;
// All candidates, so the no-learning arm stays stable and the comparison
// isolates the formula instead of the 60-row recall window.
const POOL = 2000;
const DAY_MS = 86_400_000;
const BASE_MS = Date.now();

interface EvalEntry {
  query: string;
  expectedTitle: string;
  expectedAliases?: string[];
  note?: string;
}

interface EvalSet {
  queries: EvalEntry[];
}

interface SimQuery {
  query: string;
  expected: Set<string>;
}

interface Row {
  use: number;
  selected: number;
  ignored: number;
  /** Seconds, matching the SQLite row shape. */
  lastUsedAt: number;
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

const PARAMS: Record<string, Params> = {
  new: BASE_PARAMS,
  half5: { ...BASE_PARAMS, halflifeHours: 120 },
  half20: { ...BASE_PARAMS, halflifeHours: 480 },
  cap160: { ...BASE_PARAMS, selectedCap: 160, useCap: 80 },
  cap40: { ...BASE_PARAMS, selectedCap: 40, useCap: 20 },
};

const VARIANTS = ["none", "new", "old", "half5", "half20", "cap160", "cap40"] as const;
type Variant = (typeof VARIANTS)[number];

const CLICK_BY_RANK = [1, 0.85, 0.65, 0.45, 0.3, 0.2, 0.15, 0.1];
const MISCLICK = 0.1;
const IGNORE_ABOVE = 0.5;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function capped(value: number, weight: number, cap: number): number {
  return Math.min(cap, Math.max(0, value) * weight);
}

function feedbackWith(counters: RankingCounters | null, nowMs: number, params: Params): number {
  if (!counters) return 0;
  const positive =
    capped(counters.selectedCount, params.selectedWeight, params.selectedCap) +
    capped(counters.useCount, params.useWeight, params.useCap);
  const negative = capped(counters.ignoredCount, params.ignoredWeight, params.ignoredCap);
  const ageHours = Math.max(0, (nowMs - counters.lastUsedAt) / 3_600_000);
  return (positive - negative) * 0.5 ** (ageHours / params.halflifeHours);
}

function oldFeedback(counters: RankingCounters | null, nowMs: number): number {
  if (!counters) return 0;
  const ageHours = Math.max(0, (nowMs - counters.lastUsedAt) / 3_600_000);
  const recency = ageHours <= 24 ? 60 : ageHours <= 168 ? 30 : ageHours <= 720 ? 15 : 6;
  return (
    Math.min(120, counters.useCount * 2) +
    recency +
    Math.min(80, counters.selectedCount * 20) -
    Math.min(60, counters.ignoredCount * 10)
  );
}

function feedbackFor(counters: RankingCounters | null, nowMs: number, variant: Variant): number {
  if (!counters) return 0;
  if (variant === "none") return 0;
  if (variant === "old") return oldFeedback(counters, nowMs);
  return feedbackWith(counters, nowMs, PARAMS[variant] ?? BASE_PARAMS);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const db = new DatabaseSync(dbPath, { readOnly: true });
const evalSet = JSON.parse(readFileSync(setPath, "utf-8")) as EvalSet;
const animeRows = db
  .prepare(
    `SELECT id, value, subtitle, metadata_json
     FROM unified_index
     WHERE kind = 'anime' AND scope = 'anilist'`
  )
  .all() as unknown as Array<{
  id: string;
  subtitle: string | null;
  metadata_json: string;
  value: string;
}>;
db.close();

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

const evalQueries: SimQuery[] = evalSet.queries.map((entry) => ({
  expected: new Set(
    [entry.expectedTitle, ...(entry.expectedAliases ?? [])].map(normalizeSearchText)
  ),
  query: entry.query,
}));

function buildHardQueries(index: SearchAnimeSuggestion[]): SimQuery[] {
  const seen = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const anime of index) {
    const base = normalizeSearchText(anime.title);
    if (base.length < 5) continue;
    const hasExtension = index.some((other) => {
      if (other === anime) return false;
      const title = normalizeSearchText(other.title);
      return title !== base && title.startsWith(`${base} `);
    });
    if (!hasExtension) continue;
    const prefix = anime.title.slice(0, 6).trim();
    if (prefix.length < 4) continue;
    const key = normalizeSearchText(prefix);
    if (seen.has(key)) {
      ambiguous.add(key);
      continue;
    }
    seen.set(key, anime.title);
  }
  return [...seen]
    .filter(([key]) => !ambiguous.has(key))
    .map(([, title]) => ({
      expected: new Set([normalizeSearchText(title)]),
      query: title.slice(0, 6).trim(),
    }));
}

const hardQueries = buildHardQueries(animeIndex);

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const rows = new Map<string, Row>();
const random = mulberry32(7);
const EMPTY_MAPS = { queryStats: {}, suggestionStats: {} };

function rowList(nowMs: number): LearningStatRow[] {
  const nowSeconds = Math.floor(nowMs / 1000);
  return [...rows].map(([value, row]) => ({
    id: `sim:${value}`,
    ignoredCount: row.ignored,
    kind: "anime",
    lastUsedAt: Math.min(row.lastUsedAt, nowSeconds),
    scope: "anilist",
    selectedCount: row.selected,
    useCount: row.use,
    value,
  }));
}

function record(value: string, action: "select" | "ignore", nowMs: number): void {
  const key = normalizeSearchText(value);
  const nowSeconds = Math.floor(nowMs / 1000);
  const row = rows.get(key) ?? { ignored: 0, lastUsedAt: nowSeconds, selected: 0, use: 0 };
  if (action === "select") row.selected += 1;
  else row.ignored += 1;
  row.lastUsedAt = nowSeconds;
  rows.set(key, row);
}

function rankVariant(
  candidates: SearchSuggestion[],
  maps: ReturnType<typeof buildLearningMaps>,
  nowMs: number,
  variant: Variant
): SearchSuggestion[] {
  return candidates
    .map((candidate) => {
      const stat = maps.suggestionStats[normalizeSearchText(candidate.value)];
      const counters = stat ? countersOf(stat) : null;
      return { ...candidate, score: candidate.score + feedbackFor(counters, nowMs, variant) };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.value.length - right.value.length ||
        left.value.localeCompare(right.value)
    )
    .slice(0, LIMIT);
}

interface Measure {
  found: number;
  mrr: number;
  top1: number;
  top3: number;
}

function measure(
  candidates: SearchSuggestion[],
  query: SimQuery,
  maps: ReturnType<typeof buildLearningMaps>,
  nowMs: number
): Record<Variant, Measure> {
  const result = {} as Record<Variant, Measure>;
  for (const variant of VARIANTS) {
    const ranked = rankVariant(candidates, variant === "none" ? EMPTY_MAPS : maps, nowMs, variant);
    const rank =
      ranked.findIndex((entry) => query.expected.has(normalizeSearchText(entry.value))) + 1;
    const current = result[variant] ?? { found: 0, mrr: 0, top1: 0, top3: 0 };
    current.found += rank > 0 ? 1 : 0;
    current.mrr += rank > 0 ? 1 / rank : 0;
    current.top1 += rank === 1 ? 1 : 0;
    current.top3 += rank > 0 && rank <= 3 ? 1 : 0;
    result[variant] = current;
  }
  return result;
}

function average(
  measures: Array<Record<Variant, Measure>>,
  total: number
): Record<Variant, Measure> {
  const result = {} as Record<Variant, Measure>;
  for (const variant of VARIANTS) {
    result[variant] = { found: 0, mrr: 0, top1: 0, top3: 0 };
  }
  for (const measureSet of measures) {
    for (const variant of VARIANTS) {
      result[variant].found += measureSet[variant].found;
      result[variant].mrr += measureSet[variant].mrr;
      result[variant].top1 += measureSet[variant].top1;
      result[variant].top3 += measureSet[variant].top3;
    }
  }
  for (const variant of VARIANTS) {
    result[variant].found /= total;
    result[variant].mrr /= total;
    result[variant].top1 /= total;
    result[variant].top3 /= total;
  }
  return result;
}

interface RoundReport {
  round: number;
  hard: Record<Variant, Measure>;
  eval: Record<Variant, Measure>;
  learnedRows: number;
}

const reports: RoundReport[] = [];
const allQueries = [...hardQueries, ...evalQueries];
const hardSet = new Set(hardQueries);

for (let round = 0; round <= rounds; round++) {
  const nowMs = BASE_MS + round * DAY_MS;
  const maps = buildLearningMaps(rowList(nowMs), nowMs);
  const perQuery: Array<{
    hard: boolean;
    query: SimQuery;
    candidates: SearchSuggestion[];
  }> = [];

  for (const query of allQueries) {
    const candidates = getSearchSuggestions(query.query, {
      animeIndex,
      history: [],
      limit: POOL,
      // Empty maps: candidates carry pure match + popularity, so every variant
      // starts from the same base and the no-learning arm is stable.
      symSpell: false,
    });
    perQuery.push({ candidates, hard: hardSet.has(query), query });
  }

  const hardMeasures = perQuery
    .filter((entry) => entry.hard)
    .map((entry) => measure(entry.candidates, entry.query, maps, nowMs));
  const evalMeasures = perQuery
    .filter((entry) => !entry.hard)
    .map((entry) => measure(entry.candidates, entry.query, maps, nowMs));
  reports.push({
    eval: average(evalMeasures, evalQueries.length || 1),
    hard: average(hardMeasures, hardQueries.length || 1),
    learnedRows: rows.size,
    round,
  });

  if (round === rounds) break;

  // Rank-biased click stream on the production (new formula) ranking.
  for (const entry of perQuery) {
    const shown = rankVariant(entry.candidates, maps, nowMs, "new").slice(0, LIMIT);
    const expectedIndex = shown.findIndex((candidate) =>
      entry.query.expected.has(normalizeSearchText(candidate.value))
    );
    const expected = expectedIndex !== -1 ? shown[expectedIndex] : null;
    const wrong = shown.filter(
      (candidate) => !entry.query.expected.has(normalizeSearchText(candidate.value))
    );

    if (wrong.length > 0 && random() < MISCLICK) {
      record(wrong[0]!.value, "select", nowMs);
      continue;
    }
    if (expected) {
      const click = CLICK_BY_RANK[expectedIndex] ?? 0.1;
      if (random() < click) {
        record(expected.value, "select", nowMs);
        if (expectedIndex > 0 && random() < IGNORE_ABOVE) {
          record(shown[0]!.value, "ignore", nowMs);
        }
        continue;
      }
    }
    if (shown[0]) record(shown[0].value, "ignore", nowMs);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const final = reports.at(-1)!;
const totalSelects = [...rows.values()].reduce((sum, row) => sum + row.selected, 0);
const totalIgnores = [...rows.values()].reduce((sum, row) => sum + row.ignored, 0);
const maxSelected = Math.max(0, ...[...rows.values()].map((row) => row.selected));
const maxIgnored = Math.max(0, ...[...rows.values()].map((row) => row.ignored));

const report = {
  caveat: "SIMULATED: self-labeled hard prefixes and a rank-biased click model, not real users",
  clicks: {
    ignoreAbove: IGNORE_ABOVE,
    misclick: MISCLICK,
    totalIgnores,
    totalSelects,
    trainedRows: rows.size,
    maxIgnored,
    maxSelected,
  },
  data: {
    anime: animeIndex.length,
    evalQueries: evalQueries.length,
    hardQueries: hardQueries.length,
    rounds,
  },
  params: PARAMS,
  rounds: reports.map((entry) => ({
    eval: entry.eval,
    hard: entry.hard,
    learnedRows: entry.learnedRows,
    round: entry.round,
  })),
};

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("SIMULATED — self-labeled hard prefixes + rank-biased clicks, not real users.");
  console.log(
    `hard=${hardQueries.length} eval=${evalQueries.length} rounds=${rounds} learnedRows=${rows.size} selects=${totalSelects} ignores=${totalIgnores}`
  );
  console.log(
    `model: clickByRank=${CLICK_BY_RANK.join("/")} misclick=${MISCLICK} ignoreAbove=${IGNORE_ABOVE}`
  );
  console.log("");
  for (const field of ["top1", "mrr"] as const) {
    console.log(`${field.toUpperCase()} (hard set)`);
    console.log(`round ${VARIANTS.map((variant) => variant.padStart(8)).join(" ")}`);
    for (const entry of reports) {
      console.log(
        `${String(entry.round).padStart(5)} ${VARIANTS.map((variant) =>
          entry.hard[variant][field].toFixed(3).padStart(8)
        ).join(" ")}`
      );
    }
    console.log("");
  }
  console.log("Final hard set");
  for (const variant of VARIANTS) {
    const value = final.hard[variant];
    console.log(
      `${variant.padEnd(7)} top1=${value.top1.toFixed(3)} top3=${value.top3.toFixed(3)} MRR=${value.mrr.toFixed(3)} found=${value.found.toFixed(3)}`
    );
  }
  console.log("");
  console.log("Final eval set (sanity, not the target)");
  for (const variant of VARIANTS) {
    const value = final.eval[variant];
    console.log(
      `${variant.padEnd(7)} top1=${value.top1.toFixed(3)} top3=${value.top3.toFixed(3)} MRR=${value.mrr.toFixed(3)}`
    );
  }
}
