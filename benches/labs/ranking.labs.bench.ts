import { bench, group } from "@pmndrs/labs";
// Micro benches for the extracted ranking model. The A/B arms reimplement the
// two formulas this work replaced (the old TS additive boost and the old SQL
// multiplier) so the cost of the new model is measured against the code it
// replaced, in the same process and on the same data.
//
// Budget (Ryzen 7 5800X / node 26, clock-drifted host): feedbackScore <= 30 ns
// per call; the replaced tier formulas are cheaper per call (~1 ns) but both
// are noise next to a keystroke. buildLearningMaps(10k) under 15 ms; 100
// applyLearningAction calls on a 500-entry projection under 15 ms. Regression
// threshold is labs minDelta 5%.

import { feedbackScore } from "../../src/lib/ranking/feedback.utils";
import {
  applyLearningAction,
  buildLearningMaps,
  countersOf,
  dropLearningScope,
} from "../../src/lib/ranking/learning.utils";
import type { RankingCounters } from "../../src/lib/ranking/types";
import type { LearningStatRow, SearchQueryStat } from "../../src/types/search";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const NOW_SECONDS = Math.floor(NOW / 1000);

const IDLE: RankingCounters = {
  ignoredCount: 0,
  lastUsedAt: NOW,
  selectedCount: 0,
  useCount: 0,
};
const LEARNED: RankingCounters = {
  ignoredCount: 1,
  lastUsedAt: NOW - 6 * HOUR,
  selectedCount: 2,
  useCount: 3,
};
const STALE: RankingCounters = {
  ignoredCount: 4,
  lastUsedAt: NOW - 40 * 24 * HOUR,
  selectedCount: 3,
  useCount: 12,
};

function oldTsBoost(stat: SearchQueryStat, now: number): number {
  const ageHours = Math.max(0, (now - stat.lastUsedAt) / HOUR);
  const recency = ageHours <= 24 ? 60 : ageHours <= 168 ? 30 : ageHours <= 720 ? 15 : 6;
  return (
    Math.min(120, stat.count * 2) +
    recency +
    Math.min(80, stat.selectedCount * 20) -
    Math.min(60, (stat.ignoredCount ?? 0) * 10)
  );
}

function oldSqlBoost(stat: SearchQueryStat, now: number): number {
  const ageHours = Math.max(0, (now - stat.lastUsedAt) / HOUR);
  const multiplier = ageHours <= 24 ? 1 : ageHours <= 168 ? 0.5 : ageHours <= 720 ? 0.25 : 0.1;
  return (stat.selectedCount * 20 + stat.count * 4 - (stat.ignoredCount ?? 0) * 8) * multiplier;
}

function toStat(counters: RankingCounters): SearchQueryStat {
  return {
    count: counters.useCount,
    ignoredCount: counters.ignoredCount,
    lastUsedAt: counters.lastUsedAt,
    selectedCount: counters.selectedCount,
  };
}

function makeRows(count: number): LearningStatRow[] {
  const rows: LearningStatRow[] = [];
  for (let index = 0; index < count; index++) {
    rows.push({
      id: `history:anilist:query ${index}`,
      ignoredCount: index % 7 === 0 ? 1 : 0,
      kind: index % 5 === 0 ? "anime" : "history",
      lastUsedAt: NOW_SECONDS - (index % 60) * 3600,
      scope: "anilist",
      selectedCount: index % 11 === 0 ? 2 : 0,
      useCount: (index % 4) + 1,
      value: `query ${index}`,
    });
  }
  return rows;
}

const ROWS_1K = makeRows(1_000);
const ROWS_10K = makeRows(10_000);
const ROWS_50K = makeRows(50_000);

function makeProjection(count: number): Record<string, SearchQueryStat> {
  const stats: Record<string, SearchQueryStat> = {};
  for (let index = 0; index < count; index++) {
    stats[`query ${index}`] = {
      count: (index % 4) + 1,
      ignoredCount: 0,
      lastUsedAt: NOW - index * 1000,
      selectedCount: index % 3,
    };
  }
  return stats;
}

const PROJECTION_500 = makeProjection(500);
const PROJECTION_10K = makeProjection(10_000);

group("ranking @ranking @quick", () => {
  bench("feedbackScore x50k (new, idle)", () => {
    let checksum = 0;
    for (let index = 0; index < 50_000; index++) checksum += feedbackScore(IDLE, NOW);
    return checksum;
  });

  bench("feedbackScore x50k (new, learned)", () => {
    let checksum = 0;
    for (let index = 0; index < 50_000; index++) checksum += feedbackScore(LEARNED, NOW);
    return checksum;
  });

  bench("feedbackScore x50k (new, stale + ignores)", () => {
    let checksum = 0;
    for (let index = 0; index < 50_000; index++) checksum += feedbackScore(STALE, NOW);
    return checksum;
  });

  bench("old TS boost x50k (replaced)", () => {
    const stat = toStat(STALE);
    let checksum = 0;
    for (let index = 0; index < 50_000; index++) checksum += oldTsBoost(stat, NOW);
    return checksum;
  });

  bench("old SQL boost x50k (replaced)", () => {
    const stat = toStat(STALE);
    let checksum = 0;
    for (let index = 0; index < 50_000; index++) checksum += oldSqlBoost(stat, NOW);
    return checksum;
  });

  bench("buildLearningMaps 1k rows", () =>
    buildLearningMaps(ROWS_1K, NOW).suggestionStats["query 0"]?.count ?? 0);
  bench("buildLearningMaps 10k rows", () =>
    buildLearningMaps(ROWS_10K, NOW).suggestionStats["query 0"]?.count ?? 0);
  bench("buildLearningMaps 50k rows", () =>
    buildLearningMaps(ROWS_50K, NOW).suggestionStats["query 0"]?.count ?? 0);

  bench("applyLearningAction x100 on 500-entry projection", () => {
    let stats = PROJECTION_500;
    let checksum = 0;
    for (let index = 0; index < 100; index++) {
      stats = applyLearningAction(stats, `query ${index}`, "select", NOW + index);
      checksum += stats[`query ${index}`]?.selectedCount ?? 0;
    }
    return checksum;
  });

  bench("countersOf x10k", () => {
    const stat = toStat(LEARNED);
    let checksum = 0;
    for (let index = 0; index < 10_000; index++) checksum += countersOf(stat).useCount;
    return checksum;
  });

  bench("dropLearningScope 10k entries", () =>
    Object.keys(dropLearningScope(PROJECTION_10K, "missing")).length);
});
