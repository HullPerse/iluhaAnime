import { feedbackScore } from "@/lib/core/ui/feedback.utils";
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

export function suggestionPoolSize(limit: number): number {
  const wanted = Math.max(1, limit) * RANKING.POOL_FACTOR;
  return Math.min(RANKING.POOL_MAX, Math.max(RANKING.POOL_MIN, wanted));
}
