import { RANKING } from "@/config/anilist/ranking.config";
import type { RankingCounters } from "@/types/core/ranking";

function capped(value: number, weight: number, cap: number): number {
  return Math.min(cap, Math.max(0, value) * weight);
}

/**
 * One feedback model for every suggestion source. Counters are capped before
 * the decay so a burst of clicks cannot dominate a query forever.
 */
export function feedbackScore(
  counters: RankingCounters | null | undefined,
  now = Date.now()
): number {
  if (!counters) return 0;
  const positive =
    capped(
      counters.selectedCount,
      RANKING.FEEDBACK_SELECTED_WEIGHT,
      RANKING.FEEDBACK_SELECTED_CAP
    ) + capped(counters.useCount, RANKING.FEEDBACK_USE_WEIGHT, RANKING.FEEDBACK_USE_CAP);
  const negative = capped(
    counters.ignoredCount,
    RANKING.FEEDBACK_IGNORED_WEIGHT,
    RANKING.FEEDBACK_IGNORED_CAP
  );
  const ageHours = Math.max(0, (now - counters.lastUsedAt) / 3_600_000);
  const decay = 0.5 ** (ageHours / RANKING.FEEDBACK_HALFLIFE_HOURS);
  return (positive - negative) * decay;
}
