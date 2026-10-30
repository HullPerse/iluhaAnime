export const COMPARE_WEIGHTS = {
  gap: 0.4,
  rank: 0.4,
  direction: 0.2,
} as const;

export const COMPARE_VERDICT_THRESHOLDS = {
  identical: 85,
  close: 65,
  mixed: 40,
} as const;

export const COMPARE_LOW_CONFIDENCE_SCORED = 5;
export const COMPARE_HIGH_CONFIDENCE_SCORED = 20;
export const COMPARE_MIN_RANK_SAMPLES = 3;
export const COMPARE_MIN_DIRECTION_PAIRS = 3;

export const COMPARE_DIFF_DEFAULT_THRESHOLD = 1;
