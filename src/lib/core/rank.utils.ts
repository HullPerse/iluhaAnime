import { feedbackScore } from "@/lib/core/feedback.utils";
import { RANKING } from "@/config/anilist/ranking.config";
import type { RankingCounters } from "@/types/core/ranking";

export function suggestionScore(
  match: number,
  boost: number,
  counters: RankingCounters | null | undefined,
  now = Date.now()
): number {
  return match + boost + feedbackScore(counters, now);
}

/**
 * Recall is cheap, precision is not: the backend returns a wider pool and the
 * final order is decided here, so learning cannot hide a better lexical match.
 */
export function suggestionPoolSize(limit: number): number {
  const wanted = Math.max(1, limit) * RANKING.POOL_FACTOR;
  return Math.min(RANKING.POOL_MAX, Math.max(RANKING.POOL_MIN, wanted));
}
