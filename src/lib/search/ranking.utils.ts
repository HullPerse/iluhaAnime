import { SEARCH_RANKING } from "@/config/search/ranking.config";

export function recencyBoost(ageHours: number): number {
  if (ageHours < 0) return SEARCH_RANKING.RECENCY_MAX;
  return SEARCH_RANKING.RECENCY_MAX * 0.5 ** (ageHours / SEARCH_RANKING.RECENCY_HALFLIFE_HOURS);
}
