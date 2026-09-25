import { describe, expect, it } from "vitest";

import {
  buildCompareSummary,
  normalizeScoreToHundred,
  pearsonCorrelation,
  sharedFavourites,
  topGenreOverlap,
} from "@/lib/anilist/compare.utils";
import type { AniListCollection, AniListEntry, FavouriteAnime } from "@/types/anilist";

function makeEntry(
  id: number,
  title: string,
  score: number | null,
  status = "COMPLETED",
  genres: string[] = []
): AniListEntry {
  return {
    media: {
      id,
      title,
      titles: [title],
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
