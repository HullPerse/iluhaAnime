import { SEARCH_RANKING } from "@/config/search/ranking.config";

// Step decay matching feedback_score_sql in unified_index.rs
// (1.0 within a day, 0.5 within a week, 0.25 within a month, 0.1 older)
// so TS reranking and SQL ordering agree on recency.
export function recencyBoost(ageHours: number): number {
  const { RECENCY_MAX } = SEARCH_RANKING;
  if (ageHours < 0) return RECENCY_MAX;
  if (ageHours <= 24) return RECENCY_MAX;
  if (ageHours <= 24 * 7) return RECENCY_MAX * 0.5;
  if (ageHours <= 24 * 30) return RECENCY_MAX * 0.25;
  return RECENCY_MAX * 0.1;
}
