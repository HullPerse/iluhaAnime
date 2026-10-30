import { describe, expect, it } from "vitest";

import {
  buildCompareSummary,
  buildTasteMatch,
  compareDiff,
  compareVerdict,
  filterCompareRows,
  formatNormalizedScore,
  formatSignedDelta,
  meanAbsoluteGap,
  metricScore,
  normalizeScoreToHundred,
  pearsonCorrelation,
  sharedFavourites,
  sortCompareRows,
  spearmanCorrelation,
  topGenreOverlap,
  topGenreTaste,
} from "@/lib/core/compare.utils";
import type { AniListCollection, AniListEntry, FavouriteAnime } from "@/types/anilist/anilist";

function makeEntry(
  id: number,
  title: string,
  score: number | null,
  status = "COMPLETED",
  genres: string[] = [],
  altTitles: string[] = []
): AniListEntry {
  return {
    media: {
      id,
      title,
      titles: [title, ...altTitles],
      episodes: 12,
      duration: null,
      format: "TV",
      status: "FINISHED",
      score: 80,
      genres,
      tags: [],
      description: null,
      cover_url: null,
      banner_image: null,
      id_mal: null,
      trailer_youtube_id: null,
      season: null,
      season_year: null,
      studios: [],
      next_episode: null,
      next_airing_at: null,
      start_date: null,
      end_date: null,
      popularity: null,
      favourites: null,
      rankings: [],
      relations: [],
    },
    progress: 12,
    score,
    list_status: status,
    created_at: null,
    completed_at: null,
    started_at: null,
    updated_at: null,
    notes: null,
    repeat: null,
    custom_lists: [],
  };
}

function lists(entries: AniListEntry[]): AniListCollection[] {
  return [{ name: "Completed", entries }];
}

function fav(id: number): FavouriteAnime {
  return {
    id,
    title: { romaji: `Title ${id}`, english: null },
    cover_image: null,
    mean_score: null,
    format: null,
  };
}

describe("normalizeScoreToHundred", () => {
  it("normalizes each AniList format to 0-100", () => {
    expect(normalizeScoreToHundred(80, "POINT_100")).toBe(80);
    expect(normalizeScoreToHundred(8.5, "POINT_10_DECIMAL")).toBe(85);
    expect(normalizeScoreToHundred(8, "POINT_10")).toBe(80);
    expect(normalizeScoreToHundred(4, "POINT_5")).toBe(80);
  });

  it("treats null and zero as unscored", () => {
    expect(normalizeScoreToHundred(null, "POINT_10")).toBeNull();
    expect(normalizeScoreToHundred(0, "POINT_100")).toBeNull();
  });
});

describe("pearsonCorrelation", () => {
  it("returns 1 for identical ordering with a constant bias", () => {
    expect(pearsonCorrelation([95, 90, 85], [65, 60, 55])).toBeCloseTo(1, 10);
  });

  it("returns -1 for opposite ordering", () => {
    expect(pearsonCorrelation([90, 90, 50], [50, 50, 90])).toBeCloseTo(-1, 10);
  });

  it("returns null for flat series and tiny samples", () => {
    expect(pearsonCorrelation([80, 80, 80], [80, 70, 90])).toBeNull();
    expect(pearsonCorrelation([80], [70])).toBeNull();
    expect(pearsonCorrelation([80, 70], [80])).toBeNull();
  });
});

describe("spearmanCorrelation", () => {
  it("ignores a constant score shift", () => {
    expect(spearmanCorrelation([95, 90, 85], [65, 60, 55])).toBeCloseTo(1, 10);
  });

  it("detects opposite ordering", () => {
    expect(spearmanCorrelation([80, 70, 60], [60, 70, 80])).toBeCloseTo(-1, 10);
  });

  it("uses average ranks for ties", () => {
    expect(spearmanCorrelation([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9486832980505138, 10);
  });

  it("returns null for flat series and fewer than three samples", () => {
    expect(spearmanCorrelation([80, 80, 80], [80, 70, 90])).toBeNull();
    expect(spearmanCorrelation([80, 70], [80, 70])).toBeNull();
  });
});

describe("meanAbsoluteGap", () => {
  it("averages absolute differences", () => {
    expect(meanAbsoluteGap([80, 70], [70, 60])).toBe(10);
  });

  it("returns null for empty or mismatched input", () => {
    expect(meanAbsoluteGap([], [])).toBeNull();
    expect(meanAbsoluteGap([80], [])).toBeNull();
  });
});

describe("buildTasteMatch", () => {
  it("scores identical ratings at 100", () => {
    const taste = buildTasteMatch([90, 80, 70, 60, 50], [90, 80, 70, 60, 50]);
    expect(taste.gapScore).toBe(100);
    expect(taste.rankScore).toBe(100);
    expect(taste.directionScore).toBe(100);
    expect(taste.score).toBe(100);
    expect(taste.confidence).toBe("medium");
  });

  it("keeps the score high when only the scale differs", () => {
    const taste = buildTasteMatch([95, 90, 85, 80, 75], [65, 60, 55, 50, 45]);
    expect(taste.gapScore).toBe(70);
    expect(taste.rankScore).toBe(100);
    expect(taste.directionScore).toBe(100);
    expect(taste.score).toBe(88);
  });

  it("drops opposite taste below the old delta-only score", () => {
    const taste = buildTasteMatch([90, 90, 50], [50, 50, 90]);
    expect(taste.gapScore).toBe(60);
    expect(taste.rankScore).toBe(0);
    expect(taste.directionScore).toBe(0);
    expect(taste.score).toBe(24);
    expect(taste.spearman).toBeCloseTo(-1, 10);
  });

  it("falls back to the gap score for a flat rater", () => {
    const taste = buildTasteMatch([80, 80, 80], [80, 70, 90]);
    expect(taste.rankScore).toBeNull();
    expect(taste.directionScore).toBeNull();
    expect(taste.score).toBe(93);
  });

  it("skips rank and direction until enough samples exist", () => {
    const taste = buildTasteMatch([90, 80], [70, 60]);
    expect(taste.rankScore).toBeNull();
    expect(taste.directionScore).toBeNull();
    expect(taste.score).toBe(80);
    expect(taste.confidence).toBe("low");
  });

  it("returns an empty match without shared scores", () => {
    const taste = buildTasteMatch([], []);
    expect(taste.score).toBeNull();
    expect(taste.confidence).toBe("none");
    expect(taste.scoredCount).toBe(0);
  });

  it("reports confidence from the scored count", () => {
    const ratings = (count: number) => Array.from({ length: count }, () => 80);
    expect(buildTasteMatch(ratings(4), ratings(4)).confidence).toBe("low");
    expect(buildTasteMatch(ratings(5), ratings(5)).confidence).toBe("medium");
    expect(buildTasteMatch(ratings(19), ratings(19)).confidence).toBe("medium");
    expect(buildTasteMatch(ratings(20), ratings(20)).confidence).toBe("high");
  });
});

describe("compareVerdict", () => {
  it("maps score boundaries to verdicts", () => {
    expect(compareVerdict(null)).toBe("unknown");
    expect(compareVerdict(85)).toBe("identical");
    expect(compareVerdict(84)).toBe("close");
    expect(compareVerdict(65)).toBe("close");
    expect(compareVerdict(64)).toBe("mixed");
    expect(compareVerdict(40)).toBe("mixed");
    expect(compareVerdict(39)).toBe("opposite");
  });
});

describe("metricScore", () => {
  it("reads every selectable metric from the summary", () => {
    const summary = buildCompareSummary(
      lists([makeEntry(1, "A", 9), makeEntry(2, "B", 8), makeEntry(3, "C", 7)]),
      lists([makeEntry(1, "A", 8), makeEntry(2, "B", 8), makeEntry(3, "C", 8)]),
      "POINT_10",
      "POINT_10"
    );
    expect(metricScore("delta", summary)).toBe(summary.deltaScore);
    expect(metricScore("iluha", summary)).toBe(summary.iluhaAffinity);
    expect(metricScore("mal", summary)).toBe(summary.malAffinity);
  });

  it("keeps missing metrics null", () => {
    const flat = buildCompareSummary(lists([]), lists([]), "POINT_10", "POINT_10");
    expect(metricScore("delta", flat)).toBeNull();
    expect(metricScore("iluha", flat)).toBeNull();
    expect(metricScore("mal", flat)).toBeNull();
  });
});

describe("compare formatting", () => {
  it("renders normalized scores on a ten point scale", () => {
    expect(formatNormalizedScore(85)).toBe("8.5");
    expect(formatNormalizedScore(null)).toBe("-");
  });

  it("renders signed deltas on a ten point scale", () => {
    expect(formatSignedDelta(12)).toBe("+1.2");
    expect(formatSignedDelta(-12)).toBe("-1.2");
    expect(formatSignedDelta(0)).toBe("0.0");
    expect(formatSignedDelta(null)).toBe("-");
  });
});

describe("compareDiff", () => {
  it("separates same, close, far, and unknown gaps", () => {
    expect(compareDiff(0, 1)).toBe("same");
    expect(compareDiff(1, 1)).toBe("close");
    expect(compareDiff(1.1, 1)).toBe("far");
    expect(compareDiff(null, 1)).toBe("unknown");
  });
});

describe("buildCompareSummary", () => {
  it("splits shared and unique titles", () => {
    const summary = buildCompareSummary(
      lists([makeEntry(1, "A", 8), makeEntry(2, "B", 7)]),
      lists([makeEntry(2, "B", 7), makeEntry(3, "C", 9)]),
      "POINT_10",
      "POINT_10"
    );
    expect(summary.shared.map((row) => row.id)).toEqual([2]);
    expect(summary.onlyMine.map((row) => row.id)).toEqual([1]);
    expect(summary.onlyFriend.map((row) => row.id)).toEqual([3]);
    expect(summary.sharedScoredCount).toBe(1);
    expect(summary.libraryOverlap).toBe(33);
  });

  it("computes mean delta and iluha affinity for close scores", () => {
    const summary = buildCompareSummary(
      lists([makeEntry(1, "A", 9), makeEntry(2, "B", 8), makeEntry(3, "C", 7)]),
      lists([makeEntry(1, "A", 8.8), makeEntry(2, "B", 7.8), makeEntry(3, "C", 6.8)]),
      "POINT_10",
      "POINT_10_DECIMAL"
    );
    expect(summary.meanDelta).toBe(2);
    expect(summary.deltaScore).toBe(98);
    expect(summary.iluhaAffinity).toBe(99);
    expect(summary.malAffinity).toBe(100);
    expect(summary.lowConfidence).toBe(true);
  });

  it("lifts strict raters through the pearson part of iluha affinity", () => {
    const summary = buildCompareSummary(
      lists([makeEntry(1, "A", 9.5), makeEntry(2, "B", 9), makeEntry(3, "C", 8.5)]),
      lists([makeEntry(1, "A", 6.5), makeEntry(2, "B", 6), makeEntry(3, "C", 5.5)]),
      "POINT_10_DECIMAL",
      "POINT_10_DECIMAL"
    );
    expect(summary.deltaScore).toBe(70);
    expect(summary.malAffinity).toBe(100);
    expect(summary.iluhaAffinity).toBe(79);
  });

  it("punishes opposite taste through the pearson part", () => {
    const summary = buildCompareSummary(
      lists([makeEntry(1, "A", 9), makeEntry(2, "B", 9), makeEntry(3, "C", 5)]),
      lists([makeEntry(1, "A", 5), makeEntry(2, "B", 5), makeEntry(3, "C", 9)]),
      "POINT_10",
      "POINT_10"
    );
    expect(summary.deltaScore).toBe(60);
    expect(summary.malAffinity).toBe(-100);
    expect(summary.iluhaAffinity).toBe(42);
  });

  it("falls back to delta score for flat raters", () => {
    const summary = buildCompareSummary(
      lists([makeEntry(1, "A", 8), makeEntry(2, "B", 8), makeEntry(3, "C", 8)]),
      lists([makeEntry(1, "A", 8), makeEntry(2, "B", 7), makeEntry(3, "C", 9)]),
      "POINT_10",
      "POINT_10"
    );
    expect(summary.pearson).toBeNull();
    expect(summary.malAffinity).toBeNull();
    expect(summary.iluhaAffinity).toBe(summary.deltaScore);
  });

  it("marks empty and unscored comparisons without scores", () => {
    const summary = buildCompareSummary(lists([]), lists([]), "POINT_10", "POINT_10");
    expect(summary.meanDelta).toBeNull();
    expect(summary.iluhaAffinity).toBeNull();
    expect(summary.lowConfidence).toBe(true);
    const unscored = buildCompareSummary(
      lists([makeEntry(1, "A", null)]),
      lists([makeEntry(1, "A", null)]),
      "POINT_10",
      "POINT_10"
    );
    expect(unscored.sharedScoredCount).toBe(0);
    expect(unscored.meanDelta).toBeNull();
  });

  it("clears low confidence once enough scored titles exist", () => {
    const mine = [1, 2, 3, 4, 5].map((id) => makeEntry(id, `T${id}`, 8));
    const friend = [1, 2, 3, 4, 5].map((id) => makeEntry(id, `T${id}`, 8));
    const summary = buildCompareSummary(lists(mine), lists(friend), "POINT_10", "POINT_10");
    expect(summary.sharedScoredCount).toBe(5);
    expect(summary.lowConfidence).toBe(false);
    expect(summary.iluhaAffinity).toBe(100);
  });
});

describe("topGenreOverlap", () => {
  it("returns shared genres ordered by combined count", () => {
    const mine = lists([makeEntry(1, "A", 8, "COMPLETED", ["Action", "Drama"])]);
    const friend = lists([makeEntry(2, "B", 7, "COMPLETED", ["Action", "Comedy"])]);
    expect(topGenreOverlap(mine, friend)).toEqual([{ genre: "Action", mine: 1, friend: 1 }]);
  });
});

describe("sharedFavourites", () => {
  it("keeps favourites present on both sides", () => {
    expect(sharedFavourites([fav(1), fav(2)], [fav(2), fav(3)]).map((f) => f.id)).toEqual([2]);
  });
});

describe("compare row filtering and sorting", () => {
  const mine = lists([
    makeEntry(1, "A", 9),
    makeEntry(2, "B", 8, "COMPLETED", [], ["Beta"]),
    makeEntry(3, "C", 7),
  ]);
  const friend = lists([makeEntry(1, "A", 5), makeEntry(2, "B", 8), makeEntry(3, "C", 7)]);
  const rows = buildCompareSummary(mine, friend, "POINT_10", "POINT_10").shared;

  it("filters by primary and alternative titles", () => {
    expect(filterCompareRows(rows, "b").map((row) => row.id)).toEqual([2]);
    expect(filterCompareRows(rows, "beta").map((row) => row.id)).toEqual([2]);
    expect(filterCompareRows(rows, "  ").map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("sorts by gap direction, title, and owner score", () => {
    expect(sortCompareRows(rows, "gap")[0]?.id).toBe(1);
    expect(sortCompareRows(rows, "close")[0]?.delta).toBe(0);
    expect(sortCompareRows(rows, "title").map((row) => row.id)).toEqual([1, 2, 3]);
    expect(sortCompareRows(rows, "mine")[0]?.id).toBe(1);
    expect(sortCompareRows(rows, "friend")[0]?.id).toBe(2);
  });

  it("pushes rows without a score to the end for every sort", () => {
    const mineMissing = buildCompareSummary(
      lists([makeEntry(1, "A", 9), makeEntry(2, "B", null)]),
      lists([makeEntry(1, "A", 5), makeEntry(2, "B", 5)]),
      "POINT_10",
      "POINT_10"
    );
    expect(sortCompareRows(mineMissing.shared, "gap").at(-1)?.id).toBe(2);
    expect(sortCompareRows(mineMissing.shared, "mine").at(-1)?.id).toBe(2);

    const friendMissing = buildCompareSummary(
      lists([makeEntry(1, "A", 9), makeEntry(2, "B", 5)]),
      lists([makeEntry(1, "A", 5), makeEntry(2, "B", null)]),
      "POINT_10",
      "POINT_10"
    );
    expect(sortCompareRows(friendMissing.shared, "friend").at(-1)?.id).toBe(2);
  });
});

describe("topGenreTaste", () => {
  it("averages scored titles per genre and orders by sample count", () => {
    const mine = lists([
      makeEntry(1, "A", 80, "COMPLETED", ["Action"]),
      makeEntry(2, "B", 90, "COMPLETED", ["Action", "Drama"]),
    ]);
    const friend = lists([
      makeEntry(1, "A", 60, "COMPLETED", ["Action"]),
      makeEntry(2, "B", 70, "COMPLETED", ["Action", "Drama"]),
    ]);
    expect(topGenreTaste(mine, friend, "POINT_100", "POINT_100")).toEqual([
      { genre: "Action", mine: 85, friend: 65, mineCount: 2, friendCount: 2, delta: 20 },
      { genre: "Drama", mine: 90, friend: 70, mineCount: 1, friendCount: 1, delta: 20 },
    ]);
  });

  it("skips genres scored by only one side", () => {
    const mine = lists([makeEntry(1, "A", 80, "COMPLETED", ["Action", "Drama"])]);
    const friend = lists([makeEntry(1, "A", 60, "COMPLETED", ["Action"])]);
    expect(topGenreTaste(mine, friend, "POINT_100", "POINT_100").map((row) => row.genre)).toEqual([
      "Action",
    ]);
  });
});
