import { describe, expect, it } from "vitest";

import { calculateCollectionStats } from "@/lib/collectionStats.utils";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  {
    id: "watching",
    label: "Watching",
    color: "#3b82f6",
    order: 1,
    isCore: true,
  },
  {
    id: "completed",
    label: "Completed",
    color: "#22c55e",
    order: 2,
    isCore: true,
  },
];

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item_1",
    title: "Naruto",
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 12,
    progressTotal: 220,
    progressUnit: "episodes",
    durationMinutes: 23,
    rating: 8,
    priority: "normal",
    isFavorite: false,
    year: 2002,
    genres: ["Action"],
    studio: "Pierrot",
    description: null,
    notes: null,
    coverUrl: null,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: {},
    customFields: {},
    localPath: null,
    localKind: null,
    startedAt: null,
    finishedAt: null,
    lastWatchedAt: null,
    rewatchCount: 0,
    addedAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("calculateCollectionStats", () => {
  it("returns zeroed stats for an empty library", () => {
    const stats = calculateCollectionStats([], STATUSES);
    expect(stats).toEqual({
      total: 0,
      byStatus: { planned: 0, watching: 0, completed: 0 },
      avgRating: null,
      hours: 0,
      favoriteCount: 0,
      ratingDistribution: {},
      perYearHours: {},
    });
  });

  it("counts items per status and includes statuses outside the definition", () => {
    const stats = calculateCollectionStats(
      [
        makeItem({ status: "watching" }),
        makeItem({ status: "watching" }),
        makeItem({ status: "planned" }),
        makeItem({ status: "custom_x" }),
      ],
      STATUSES
    );
    expect(stats.byStatus).toEqual({
      planned: 1,
      watching: 2,
      completed: 0,
      custom_x: 1,
    });
  });

  it("computes the average rating rounded to one decimal", () => {
    const stats = calculateCollectionStats(
      [
        makeItem({ rating: 8 }),
        makeItem({ rating: 8 }),
        makeItem({ rating: 7 }),
        makeItem({ rating: null }),
      ],
      STATUSES
    );
    expect(stats.avgRating).toBe(7.7);
  });

  it("returns null average when no item is rated", () => {
    const stats = calculateCollectionStats(
      [makeItem({ rating: null })],
      STATUSES
    );
    expect(stats.avgRating).toBeNull();
  });

  it("builds the rating distribution", () => {
    const stats = calculateCollectionStats(
      [
        makeItem({ rating: 8 }),
        makeItem({ rating: 8 }),
        makeItem({ rating: 7 }),
      ],
      STATUSES
    );
    expect(stats.ratingDistribution).toEqual({ 8: 2, 7: 1 });
  });

  it("counts favorites", () => {
    const stats = calculateCollectionStats(
      [
        makeItem({ isFavorite: true }),
        makeItem({ isFavorite: false }),
        makeItem({ isFavorite: true }),
      ],
      STATUSES
    );
    expect(stats.favoriteCount).toBe(2);
  });

  it("computes hours from episode progress with a default 24-minute episode", () => {
    const stats = calculateCollectionStats(
      [makeItem({ progressUnit: "episodes", durationMinutes: null, progressValue: 10 })],
      STATUSES
    );
    expect(stats.hours).toBe(4);
  });

  it("uses the item duration when present", () => {
    const stats = calculateCollectionStats(
      [makeItem({ durationMinutes: 23, progressValue: 60 })],
      STATUSES
    );
    expect(stats.hours).toBe(23);
  });

  it("treats the minutes unit as one minute per unit", () => {
    const stats = calculateCollectionStats(
      [makeItem({ progressUnit: "minutes", progressValue: 120 })],
      STATUSES
    );
    expect(stats.hours).toBe(2);
  });

  it("rounds the total hours", () => {
    const stats = calculateCollectionStats(
      [makeItem({ durationMinutes: 23, progressValue: 100 })],
      STATUSES
    );
    // 100 episodes * 23 min = 2300 min = 38.33 h
    expect(stats.hours).toBe(38);
  });

  it("accumulates per-year hours only for items with a year and progress", () => {
    const stats = calculateCollectionStats(
      [
        makeItem({ year: 2002, durationMinutes: 23, progressValue: 60 }),
        makeItem({ year: 2002, durationMinutes: 23, progressValue: 30 }),
        makeItem({ year: null, durationMinutes: 23, progressValue: 60 }),
        makeItem({ year: 2010, durationMinutes: 23, progressValue: 0 }),
      ],
      STATUSES
    );
    // 2002: 60 + 30 episodes * 23 min = 2070 min = 34.5 h (unrounded)
    expect(stats.perYearHours[2002]).toBeCloseTo(34.5, 5);
    expect(stats.perYearHours[2010]).toBeUndefined();
    expect(stats.perYearHours[null as unknown as number]).toBeUndefined();
    // The year-less item still counts toward the total: 34.5 + 23 = 57.5 -> 58
    expect(stats.hours).toBe(58);
  });

  it("ignores zero progress in the hours total", () => {
    const stats = calculateCollectionStats(
      [makeItem({ progressValue: 0, durationMinutes: 23 })],
      STATUSES
    );
    expect(stats.hours).toBe(0);
    expect(stats.perYearHours).toEqual({});
  });
});