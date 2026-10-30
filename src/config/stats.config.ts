export const STATS_GENRE_LIMIT = 8;
export const STATS_STUDIO_LIMIT = 6;
export const STATS_COMPLETION_GENRE_LIMIT = 8;
export const STATS_MIN_GENRE_SAMPLE = 5;
export const STATS_STARTED_STATUSES = [
  "CURRENT",
  "REPEATING",
  "COMPLETED",
  "PAUSED",
  "DROPPED",
] as const;
export const STATS_STATUS_ORDER = [
  "CURRENT",
  "REPEATING",
  "COMPLETED",
  "PAUSED",
  "DROPPED",
  "PLANNING",
] as const;
