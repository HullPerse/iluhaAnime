import { bench, group } from "@pmndrs/labs";
// Detail-screen render path: per-row score formatting (friendsScores.detail
// controls.detail, quickadd.detail call parseScoreFormat per render) and the
// SimilarSection filter-sort-slice memo over recs + relations + franchise.
// Budget (avg/iter, Ryzen 7 5800X/node 26, 2026-10-17): score rows x25
// 1.08us, similar filter-sort 3.00us; this file is noise-flagged (±5-15%).
// Regression threshold is labs minDelta 5%.

import { formatScore, resolveDisplayScoreFormat, scoreIconFor } from "../../src/lib/anilist/anilistScore.utils";
import type { AnilistScoreFormat } from "../../src/types/anilist/anilistScore";

const FORMATS: readonly string[] = ["POINT_100", "POINT_10_DECIMAL", "POINT_10", "POINT_5", "bogus"];
const SCORES: ReadonlyArray<number | null> = [9, 85, 8.5, 4, null, 0, 10, 3, 72, 5];

interface FriendRow {
  score: number | null;
  scoreFormat: string;
}

const ROWS_25: FriendRow[] = Array.from({ length: 25 }, (_, i) => ({
  score: SCORES[i % SCORES.length]!,
  scoreFormat: FORMATS[i % FORMATS.length]!,
}));

interface Rec {
  id: number;
  recommendation_rating: number;
}

const RECS_50: Rec[] = Array.from({ length: 50 }, (_, i) => ({
  id: 1000 + i,
  recommendation_rating: (i * 37) % 100,
}));
const RELATION_IDS = [1001, 1005, 1010, 1020, 1030, 1040, 1003, 1007, 1015, 1049];
const FRANCHISE_IDS = [1002, 1004, 1006, 1008, 1012, 1016, 1024, 1032, 1048, 1047];
const SIMILAR_LIMIT = 12;
const ANIME_ID = 21;

function similarItems(): number[] {
  const excluded = new Set<number>([ANIME_ID]);
  for (const id of RELATION_IDS) excluded.add(id);
  for (const id of FRANCHISE_IDS) excluded.add(id);
  return RECS_50.filter((rec) => !excluded.has(rec.id))
    .sort((a, b) => b.recommendation_rating - a.recommendation_rating)
    .slice(0, SIMILAR_LIMIT)
    .map((rec) => rec.id);
}

group("anilist-detail @anilist @quick", () => {
  bench("detail score rows x25", () => {
    let sum = 0;
    for (const row of ROWS_25) {
      const format: AnilistScoreFormat = resolveDisplayScoreFormat(
        "friend",
        row.scoreFormat,
        "POINT_10"
      );
      sum += formatScore(row.score, format).length + scoreIconFor(format, row.score).length;
    }
    return sum;
  });

  bench("similar filter-sort x50 recs", () => {
    const ids = similarItems();
    let sum = ids.length;
    for (const id of ids) sum += id;
    return sum;
  });
});
