import type { CorrectionReason, LearningStatRow, SearchQueryStat } from "@/types/search";

import { RANKING } from "./ranking.config";
import type { RankingCounters } from "./types";

export type LearningAction = "use" | "select" | "ignore";

export interface LearningMaps {
  /** Keyed by `${scope}:${normalized}`. */
  queryStats: Record<string, SearchQueryStat>;
  /** Keyed by normalized value, merged across scopes and kinds. */
  suggestionStats: Record<string, SearchQueryStat>;
}

export function learningStatKey(scope: string, normalized: string): string {
  return `${scope}:${normalized}`;
}

export function countersOf(stat: SearchQueryStat): RankingCounters {
  return {
    useCount: stat.count,
    selectedCount: stat.selectedCount,
    ignoredCount: stat.ignoredCount ?? 0,
    lastUsedAt: stat.lastUsedAt,
  };
}

function mergeStat(
  target: Record<string, SearchQueryStat>,
  key: string,
  stat: SearchQueryStat
): void {
  const current = target[key];
  if (!current) {
    target[key] = { ...stat };
    return;
  }
  target[key] = {
    count: current.count + stat.count,
    ignoredCount: (current.ignoredCount ?? 0) + (stat.ignoredCount ?? 0),
    lastIgnoredAt: Math.max(current.lastIgnoredAt ?? 0, stat.lastIgnoredAt ?? 0) || undefined,
    lastUsedAt: Math.max(current.lastUsedAt, stat.lastUsedAt),
    selectedCount: current.selectedCount + stat.selectedCount,
  };
}

/**
 * Rows come from SQLite in seconds; every consumer uses milliseconds, so the
 * conversion happens once here. Stale rows are filtered at the same time.
 */
export function buildLearningMaps(
  rows: readonly LearningStatRow[],
  now = Date.now()
): LearningMaps {
  const cutoff = now - RANKING.TTL_MS;
  const queryStats: Record<string, SearchQueryStat> = {};
  const suggestionStats: Record<string, SearchQueryStat> = {};
  for (const row of rows) {
    const lastUsedAt = row.lastUsedAt > 0 ? row.lastUsedAt * 1000 : 0;
    if (lastUsedAt < cutoff) continue;
    const stat: SearchQueryStat = {
      count: Math.max(0, row.useCount),
      ignoredCount: Math.max(0, row.ignoredCount),
      lastUsedAt,
      selectedCount: Math.max(0, row.selectedCount),
    };
    if (row.kind === "history") {
      queryStats[learningStatKey(row.scope, row.value)] = stat;
    }
    mergeStat(suggestionStats, row.value, stat);
  }
  return { queryStats, suggestionStats };
}

export function applyLearningAction(
  stats: Record<string, SearchQueryStat>,
  key: string,
  action: LearningAction,
  now = Date.now(),
  reason?: CorrectionReason
): Record<string, SearchQueryStat> {
  const current = stats[key] ?? { count: 0, lastUsedAt: now, selectedCount: 0 };
  const next: SearchQueryStat = { ...current, lastUsedAt: now };
  if (reason) next.lastReason = reason;
  if (action === "use") next.count = current.count + 1;
  if (action === "select") next.selectedCount = current.selectedCount + 1;
  if (action === "ignore") {
    next.ignoredCount = (current.ignoredCount ?? 0) + 1;
    next.lastIgnoredAt = now;
  }
  return { ...stats, [key]: next };
}

export function dropLearningScope(
  stats: Record<string, SearchQueryStat>,
  scope: string
): Record<string, SearchQueryStat> {
  const prefix = `${scope}:`;
  const next: Record<string, SearchQueryStat> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (!key.startsWith(prefix)) next[key] = value;
  }
  return next;
}
