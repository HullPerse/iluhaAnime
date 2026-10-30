import { describe, expect, it } from "vitest";

import { buildMediaRows, buildStatsOverview } from "@/lib/anilist/anilistStats.utils";
import type { AniListCollection, AniListEntry, AniListStatistics } from "@/types/anilist/anilist";

function statistics(overrides: Partial<AniListStatistics> = {}): AniListStatistics {
  return {
    count: 0,
    mean_score: 0,
    standard_deviation: 0,
    minutes_watched: 0,
    episodes_watched: 0,
    statuses: [],
    scores: [],
    formats: [],
    release_years: [],
    start_years: [],
    genres: [],
    studios: [],
    ...overrides,
  };
}

function entry(
  id: number,
  status: string,
  genres: string[],
  extra: Partial<AniListEntry> = {}
): AniListEntry {
  return {
    media: {
      id,
      title: `Title ${id}`,
      genres,
      cover_url: `cover/${id}.jpg`,
      episodes: 12,
    } as unknown as AniListEntry["media"],
    progress: 5,
    score: 8,
    list_status: status,
    created_at: null,
    completed_at: null,
    started_at: null,
    updated_at: null,
    notes: null,
    repeat: 0,
    custom_lists: [],
    ...extra,
  };
}

function lists(entries: AniListEntry[], ...groups: string[]): AniListCollection[] {
  return [groups[0] ?? "Watching", ...groups.slice(1)].map((name) => ({
    name,
    entries: name === (groups[0] ?? "Watching") ? entries : [],
  }));
}

describe("buildStatsOverview", () => {
  it("builds the KPI strip from AniList minutes and the score format", () => {
    const model = buildStatsOverview({
      statistics: statistics({
        count: 286,
        mean_score: 74.4,
        standard_deviation: 12.75,
        minutes_watched: 152_640,
        episodes_watched: 6_360,
        statuses: [{ status: "COMPLETED", count: 210, minutes_watched: 120_000 }],
      }),
      lists: [],
      scoreFormat: "POINT_100",
    });

    expect(model.isEmpty).toBe(false);
    expect(model.kpi).toMatchObject({
      titles: 286,
      episodes: 6_360,
      hours: 2_544,
      mean: 74.4,
      meanLabel: "74.4/100",
    });
  });

  it("computes the completion rate without planning entries", () => {
    const model = buildStatsOverview({
      statistics: statistics({
        count: 40,
        statuses: [
          { status: "COMPLETED", count: 10, minutes_watched: 0 },
          { status: "CURRENT", count: 5, minutes_watched: 0 },
          { status: "DROPPED", count: 3, minutes_watched: 0 },
          { status: "PAUSED", count: 1, minutes_watched: 0 },
          { status: "REPEATING", count: 1, minutes_watched: 0 },
          { status: "PLANNING", count: 20, minutes_watched: 0 },
        ],
      }),
      lists: [],
      scoreFormat: "POINT_10",
    });

    expect(model.kpi).toMatchObject({ completed: 10, started: 20 });
    expect(model.kpi.completionRate).toBe(0.5);
    expect(model.statuses.map((row) => row.status)).toEqual([
      "CURRENT",
      "REPEATING",
      "COMPLETED",
      "PAUSED",
      "DROPPED",
      "PLANNING",
    ]);
  });

  it("buckets a hundred point scale into twenty score bands", () => {
    const model = buildStatsOverview({
      statistics: statistics({
        count: 4,
        mean_score: 83.5,
        scores: [
          { score: 74, count: 2 },
          { score: 76, count: 1 },
          { score: 100, count: 1 },
        ],
      }),
      lists: [],
      scoreFormat: "POINT_100",
    });

    expect(model.scores.max).toBe(100);
    expect(model.scores.buckets).toHaveLength(20);
    expect(model.scores.buckets[14]).toMatchObject({ count: 2, from: 70, to: 75, label: "75" });
    expect(model.scores.buckets[15]?.count).toBe(1);
    expect(model.scores.buckets[19]).toMatchObject({ count: 1, label: "100" });
    expect(model.scores.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
  });

  it("keeps three buckets for the three point scale", () => {
    const model = buildStatsOverview({
      statistics: statistics({
        count: 2,
        mean_score: 2,
        scores: [
          { score: 1, count: 1 },
          { score: 3, count: 1 },
        ],
      }),
      lists: [],
      scoreFormat: "POINT_3",
    });

    expect(model.scores.buckets.map((bucket) => bucket.label)).toEqual(["1", "2", "3"]);
    expect(model.scores.buckets[0]?.count).toBe(1);
    expect(model.scores.buckets[2]?.count).toBe(1);
  });

  it("uses half point buckets for decimal scores", () => {
    const model = buildStatsOverview({
      statistics: statistics({
        count: 1,
        mean_score: 7.5,
        scores: [{ score: 7.5, count: 1 }],
      }),
      lists: [],
      scoreFormat: "POINT_10_DECIMAL",
    });

    expect(model.scores.buckets).toHaveLength(20);
    expect(model.scores.buckets[14]).toMatchObject({ count: 1, from: 7, to: 7.5, label: "7.5" });
  });

  it("sorts and caps the genre and studio blocks", () => {
    const genres = Array.from({ length: 10 }, (_, index) => ({
      genre: `Genre ${index}`,
      count: 10 - index,
      mean_score: 70,
      minutes_watched: 100,
      media_ids: [index],
    }));
    const studios = Array.from({ length: 8 }, (_, index) => ({
      id: index,
      name: `Studio ${index}`,
      count: 8 - index,
      mean_score: 70,
      minutes_watched: 100,
      media_ids: [index],
    }));
    const model = buildStatsOverview({
      statistics: statistics({ count: 10, genres, studios }),
      lists: [],
      scoreFormat: "POINT_10",
    });

    expect(model.genres).toHaveLength(8);
    expect(model.genres[0]?.genre).toBe("Genre 0");
    expect(model.studios).toHaveLength(6);
    expect(model.studios[5]?.name).toBe("Studio 5");
  });

  it("sorts watched and release years ascending", () => {
    const model = buildStatsOverview({
      statistics: statistics({
        count: 3,
        start_years: [
          { year: 2022, count: 2, mean_score: 0, minutes_watched: 0, media_ids: [2] },
          { year: 2019, count: 1, mean_score: 0, minutes_watched: 0, media_ids: [1] },
        ],
        release_years: [
          { year: 2020, count: 1, mean_score: 0, minutes_watched: 0, media_ids: [3] },
          { year: 2018, count: 2, mean_score: 0, minutes_watched: 0, media_ids: [4] },
        ],
      }),
      lists: [],
      scoreFormat: "POINT_10",
    });

    expect(model.startYears.map((row) => row.year)).toEqual([2019, 2022]);
    expect(model.releaseYears.map((row) => row.year)).toEqual([2018, 2020]);
  });

  it("counts completion by genre once per title and hides small samples", () => {
    const entries = [
      entry(1, "COMPLETED", ["Drama"]),
      entry(2, "COMPLETED", ["Drama"]),
      entry(3, "COMPLETED", ["Drama"]),
      entry(4, "COMPLETED", ["Drama"]),
      entry(5, "COMPLETED", ["Drama"]),
      entry(6, "DROPPED", ["Drama"]),
      entry(7, "PLANNING", ["Drama"]),
      entry(8, "COMPLETED", ["Comedy"]),
      entry(9, "DROPPED", ["Comedy"]),
      entry(10, "COMPLETED", ["Comedy"]),
      entry(11, "COMPLETED", ["Comedy"]),
    ];
    const model = buildStatsOverview({
      statistics: statistics({ count: 11 }),
      lists: [
        { name: "Watching", entries },
        { name: "Custom", entries: [entries[0]!, entries[1]!] },
      ],
      scoreFormat: "POINT_10",
    });

    expect(model.completion).toHaveLength(1);
    expect(model.completion[0]).toMatchObject({
      genre: "Drama",
      started: 6,
      completed: 5,
    });
    expect(model.completion[0]?.rate).toBeCloseTo(5 / 6);
  });

  it("returns an empty model without NaN for a new account", () => {
    const model = buildStatsOverview({
      statistics: statistics(),
      lists: [],
      scoreFormat: "POINT_10",
    });

    expect(model.isEmpty).toBe(true);
    expect(model.kpi.meanLabel).toBeNull();
    expect(model.kpi.completionRate).toBeNull();
    expect(model.scores.buckets).toHaveLength(10);
    expect(model.scores.buckets.every((bucket) => bucket.count === 0)).toBe(true);
    expect(model.completion).toEqual([]);
    expect(Number.isNaN(model.kpi.hours)).toBe(false);
  });
});

describe("buildMediaRows", () => {
  it("keeps the requested order, dedupes and skips missing ids", () => {
    const entries = [entry(2, "COMPLETED", ["Drama"]), entry(1, "CURRENT", ["Comedy"])];
    const rows = buildMediaRows(
      [1, 2, 1, 99],
      [
        { name: "Watching", entries },
        { name: "Custom", entries: [entries[0]!] },
      ]
    );

    expect(rows.map((row) => row.id)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      title: "Title 1",
      coverUrl: "cover/1.jpg",
      score: 8,
      progress: 5,
      episodes: 12,
      status: "CURRENT",
    });
  });

  it("returns nothing for an empty id list", () => {
    expect(buildMediaRows([], lists([entry(1, "COMPLETED", ["Drama"])]))).toEqual([]);
  });
});
