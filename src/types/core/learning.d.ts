import type { SearchQueryStat } from "@/types/search/search";

export type LearningAction = "use" | "select" | "ignore";

export interface LearningMaps {
  queryStats: Record<string, SearchQueryStat>;
  suggestionStats: Record<string, SearchQueryStat>;
}
