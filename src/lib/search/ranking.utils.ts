import { SEARCH_RANKING } from "@/config/search/ranking.config";

export function recencyBoost(ageHours: number): number {
  const { RECENCY_MAX } = SEARCH_RANKING;
  if (ageHours < 0) return RECENCY_MAX;
  if (ageHours <= 24) return RECENCY_MAX;
  if (ageHours <= 24 * 7) return RECENCY_MAX * 0.5;
  if (ageHours <= 24 * 30) return RECENCY_MAX * 0.25;
  return RECENCY_MAX * 0.1;
}
