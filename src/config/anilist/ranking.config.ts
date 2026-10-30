/**
 * Single source of truth for ranking weights. The backend no longer scores
 * candidates, so these numbers never need a Rust twin.
 */
export const RANKING = {
  MAX_QUERY_LENGTH: 200,
  MAX_LEARNING_ITEMS: 2000,

  TTL_DAYS: 90,
  TTL_MS: 90 * 24 * 60 * 60 * 1000,

  FEEDBACK_USE_WEIGHT: 4,
  FEEDBACK_USE_CAP: 40,
  FEEDBACK_SELECTED_WEIGHT: 20,
  FEEDBACK_SELECTED_CAP: 80,
  FEEDBACK_IGNORED_WEIGHT: 8,
  FEEDBACK_IGNORED_CAP: 60,
  /** Ten days keeps "yesterday" clearly ahead without erasing month-old habits. */
  FEEDBACK_HALFLIFE_HOURS: 240,

  POOL_FACTOR: 6,
  POOL_MIN: 30,
  POOL_MAX: 60,

  WIZARD_DUPLICATE_PENALTY: 200,
  WIZARD_FAVOURITE_BOOST: 50,
  COLLECTION_BOOST: 320,
  TAG_BOOST: 400,
  OPERATOR_HINT_SCORE: 400,
} as const;
