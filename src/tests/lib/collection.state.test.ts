import { describe, expect, it } from "vitest";
import { PUBLIC_STATUS_MAX_ITEMS } from "@/config/anilist/statuses.config";
import { calculateCollectionStats } from "@/lib/anilist/collectionStats.utils";
import {
  buildCustomStatusId,
  isPublicStatus,
  isPublicStatusFull,
  normalizeStatusLabel,
  publicStatusIds,
  publicStatusPrefill,
  resolveStatusLabel,
  sortStatuses,
  splitStatusLabel,
  statusLabel,
} from "@/lib/core/anilist/status.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { CollectionItem, CollectionStatusDef } from "@/types/anilist/collection";

describe("collection/stats", () => {
  const STATUSES: CollectionStatusDef[] = [
    { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true, kind: "private" },
    {
      id: "watching",
      label: "Watching",
      color: "#3b82f6",
      order: 1,
      isCore: true,
      kind: "private",
    },
    {
      id: "completed",
      label: "Completed",
      color: "#22c55e",
      order: 2,
      isCore: true,
      kind: "private",
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
      releaseDate: null,
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
      sitesToView: [],
      tvCurrentSeason: null,
      tvCurrentEpisode: null,
      detailsJson: null,
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

    it("counts a public status on its own tab but keeps it out of the library totals", () => {
      const statuses: CollectionStatusDef[] = [
        ...STATUSES,
        {
          id: "share_1",
          label: "Friends",
          color: "#0ea5e9",
          order: 3,
          isCore: false,
          kind: "public",
        },
      ];
      const stats = calculateCollectionStats(
        [
          makeItem({ id: "own", status: "watching" }),
          makeItem({ id: "shared", status: "share_1", isFavorite: true }),
        ],
        statuses
      );
      expect(stats.byStatus).toMatchObject({ watching: 1, share_1: 1 });
      expect(stats.total).toBe(1);
      expect(stats.favoriteCount).toBe(0);
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
      const stats = calculateCollectionStats([makeItem({ rating: null })], STATUSES);
      expect(stats.avgRating).toBeNull();
    });

    it("builds the rating distribution", () => {
      const stats = calculateCollectionStats(
        [makeItem({ rating: 8 }), makeItem({ rating: 8 }), makeItem({ rating: 7 })],
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
      expect(stats.perYearHours[2002]).toBeCloseTo(34.5, 5);
      expect(stats.perYearHours[2010]).toBeUndefined();
      expect(stats.perYearHours[null as unknown as number]).toBeUndefined();
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
});

describe("collection/status", () => {
  const t = (key: TranslationKey): string => key;

  const STATUSES: CollectionStatusDef[] = [
    { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true, kind: "private" },
    {
      id: "watching",
      label: "Watching",
      color: "#3b82f6",
      order: 1,
      isCore: true,
      kind: "private",
    },
    {
      id: "completed",
      label: "Completed",
      color: "#22c55e",
      order: 2,
      isCore: true,
      kind: "private",
    },
  ];

  describe("splitStatusLabel", () => {
    it.each([
      ["Solo", { en: "Solo", ru: "Solo" }],
      ["Reading,  Читаю", { en: "Reading", ru: "Читаю" }],
      ["A,B,C", { en: "A", ru: "B,C" }],
      ["Reading,", { en: "Reading", ru: "Reading" }],
      [",Читаю", { en: "Читаю", ru: "Читаю" }],
    ] as const)("splits %s", (input, expected) => {
      expect(splitStatusLabel(input)).toEqual(expected);
    });
  });

  describe("normalizeStatusLabel", () => {
    it.each([
      ["  Solo  ", "Solo"],
      ["Reading,  Читаю", "Reading,Читаю"],
      [" , ", ""],
    ] as const)("normalizes %s", (input, expected) => {
      expect(normalizeStatusLabel(input)).toBe(expected);
    });
  });

  describe("resolveStatusLabel", () => {
    it.each([
      ["Reading,Читаю", "en", "Reading"],
      ["Reading,Читаю", "ru", "Читаю"],
      ["Solo", "en", "Solo"],
      ["Solo", "ru", "Solo"],
    ] as const)("resolves %s for %s", (label, locale, expected) => {
      expect(resolveStatusLabel(label, locale)).toBe(expected);
    });
  });

  describe("statusLabel", () => {
    const STATUSES: CollectionStatusDef[] = [
      {
        id: "planned",
        label: "Planned",
        color: "#9ca3af",
        order: 0,
        isCore: true,
        kind: "private",
      },
      {
        id: "watching",
        label: "Watching",
        color: "#3b82f6",
        order: 1,
        isCore: true,
        kind: "private",
      },
      {
        id: "custom_bi",
        label: "Reading,Читаю",
        color: "#3b82f6",
        order: 7,
        isCore: false,
        kind: "private",
      },
      {
        id: "custom_solo",
        label: "Solo",
        color: "#22c55e",
        order: 8,
        isCore: false,
        kind: "private",
      },
    ];
    it.each([
      ["planned", "ru", "collection.status.planned"],
      ["custom_bi", "en", "Reading"],
      ["custom_bi", "ru", "Читаю"],
      ["custom_solo", "en", "Solo"],
      ["custom_solo", "ru", "Solo"],
      ["missing", "ru", "missing"],
    ] as const)("resolves %s for %s", (id, locale, expected) => {
      expect(statusLabel(STATUSES, id, t, locale)).toBe(expected);
    });
  });

  describe("buildCustomStatusId", () => {
    it("builds the slug from the English part", () => {
      expect(buildCustomStatusId("Reading,Читаю")).toMatch(/^custom_reading_[0-9a-z]+$/);
    });

    it("still returns an id for a Cyrillic-only label", () => {
      expect(buildCustomStatusId("Читаю")).toMatch(/^custom_[0-9a-z]+$/);
    });
  });

  describe("sortStatuses", () => {
    it("puts core statuses first even when a custom status has the lowest order", () => {
      const mixed: CollectionStatusDef[] = [
        {
          id: "custom_early",
          label: "Early",
          color: "#22c55e",
          order: 0,
          isCore: false,
          kind: "private",
        },
        {
          id: "dropped",
          label: "Dropped",
          color: "#ef4444",
          order: 5,
          isCore: true,
          kind: "private",
        },
        {
          id: "planned",
          label: "Planned",
          color: "#9ca3af",
          order: 1,
          isCore: true,
          kind: "private",
        },
        {
          id: "custom_late",
          label: "Late",
          color: "#3b82f6",
          order: 2,
          isCore: false,
          kind: "private",
        },
      ];
      expect(sortStatuses(mixed).map((s) => s.id)).toEqual([
        "planned",
        "dropped",
        "custom_early",
        "custom_late",
      ]);
    });

    it("pushes non-finite order last without mutating the input", () => {
      const mixed: CollectionStatusDef[] = [
        {
          id: "custom_nan",
          label: "Broken",
          color: "#22c55e",
          order: NaN,
          isCore: false,
          kind: "private",
        },
        {
          id: "custom_ok",
          label: "Ok",
          color: "#3b82f6",
          order: 7,
          isCore: false,
          kind: "private",
        },
      ];
      const snapshot = [...mixed];
      expect(sortStatuses(mixed).map((s) => s.id)).toEqual(["custom_ok", "custom_nan"]);
      expect(mixed.map((s) => s.id)).toEqual(snapshot.map((s) => s.id));
    });
  });

  describe("public statuses", () => {
    const mixed: CollectionStatusDef[] = [
      ...STATUSES,
      {
        id: "share_1",
        label: "Friends",
        color: "#0ea5e9",
        order: 9,
        isCore: false,
        kind: "public",
      },
      { id: "share_2", label: "Ideas", color: "#0ea5e9", order: 10, isCore: false, kind: "public" },
    ];

    it("flags public statuses and collects the ids to keep out of All", () => {
      expect(mixed.filter(isPublicStatus).map((s) => s.id)).toEqual(["share_1", "share_2"]);
      expect([...publicStatusIds(mixed)]).toEqual(["share_1", "share_2"]);
      expect([...publicStatusIds(STATUSES)]).toEqual([]);
    });
  });

  describe("publicStatusPrefill", () => {
    const mixed: CollectionStatusDef[] = [
      ...STATUSES,
      {
        id: "share_1",
        label: "Friends",
        color: "#0ea5e9",
        order: 9,
        isCore: false,
        kind: "public",
      },
    ];

    it("prefills public tabs and returns null otherwise", () => {
      expect(publicStatusPrefill(mixed, "share_1")).toEqual({
        title: "",
        coverUrl: null,
        status: "share_1",
      });
      expect(publicStatusPrefill(mixed, "all")).toBeNull();
      expect(publicStatusPrefill(mixed, "planned")).toBeNull();
      expect(publicStatusPrefill(mixed, "missing")).toBeNull();
    });
  });

  describe("isPublicStatusFull", () => {
    const mixed: CollectionStatusDef[] = [
      ...STATUSES,
      {
        id: "share_1",
        label: "Friends",
        color: "#0ea5e9",
        order: 9,
        isCore: false,
        kind: "public",
      },
    ];

    it.each([
      ["share_1", PUBLIC_STATUS_MAX_ITEMS, true],
      ["share_1", PUBLIC_STATUS_MAX_ITEMS + 5, true],
      ["share_1", PUBLIC_STATUS_MAX_ITEMS - 1, false],
      ["planned", 10000, false],
      ["all", 10000, false],
      ["missing", 10000, false],
    ] as const)("caps %s at %s as %s", (id, count, expected) => {
      expect(isPublicStatusFull(mixed, id, count)).toBe(expected);
    });
  });
});
