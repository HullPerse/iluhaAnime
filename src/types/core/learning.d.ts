import type { SearchQueryStat } from "@/types/search/search";

export type LearningAction = "use" | "select" | "ignore";

export interface LearningMaps {
  /** Keyed by `${scope}:${normalized}`. */
  queryStats: Record<string, SearchQueryStat>;
  /** Keyed by normalized value, merged across scopes and kinds. */
  suggestionStats: Record<string, SearchQueryStat>;
}
