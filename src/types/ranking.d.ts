export interface RankingCounters {
  useCount: number;
  selectedCount: number;
  ignoredCount: number;
  /** Milliseconds since epoch. */
  lastUsedAt: number;
}
