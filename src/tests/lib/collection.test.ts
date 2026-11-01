import { describe, expect, it } from "vitest";
import { groupItemsByStatus, shouldGroupByStatus } from "@/lib/anilist/collectionGroup.utils";
import { buildCollectionQueryHints } from "@/lib/core/hints.utils";
import {
  buildAnilistPrefill,
  entryDiffers,
  entrySyncState,
  entryToWizardValues,
  mediaToWizardValues,
} from "@/lib/core/import.utils";
import { computeGroupProgress } from "@/lib/core/importProgress.utils";
import { readStoredMedia, withStoredMedia } from "@/lib/anilist/collectionMedia.utils";
import {
  buildCollectionSearchIndex,
  searchCollectionIndex,
} from "@/lib/anilist/collectionSearch.utils";
import { buildShareImportPlan } from "@/lib/core/share.utils";
import type { AniListEntry } from "@/types/anilist/anilist";
import type {
  CollectionItem,
  CollectionStatusDef,
  QuickAddListEntry,
  QuickAddMedia,
} from "@/types/anilist/collection";
import type { CollectionShareDeepLink } from "@/types/core/deeplink";

describe("collection/group", () => {
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
    { id: "share_1", label: "Friends", color: "#0ea5e9", order: 3, isCore: false, kind: "public" },
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

  describe("groupItemsByStatus", () => {
    it("returns an empty array for an empty library", () => {
      expect(groupItemsByStatus([], STATUSES)).toEqual([]);
    });

    it("groups items by status in status-definition order", () => {
      const groups = groupItemsByStatus(
        [
          makeItem({ id: "a", status: "completed" }),
          makeItem({ id: "b", status: "watching" }),
          makeItem({ id: "c", status: "completed" }),
          makeItem({ id: "d", status: "planned" }),
        ],
        STATUSES
      );
      expect(groups.map((g) => g.status.id)).toEqual(["planned", "watching", "completed"]);
      expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["d"], ["b"], ["a", "c"]]);
    });

    it("skips statuses without items", () => {
      const groups = groupItemsByStatus([makeItem({ status: "watching" })], STATUSES);
      expect(groups.map((g) => g.status.id)).toEqual(["watching"]);
    });

    it("preserves item order inside a group", () => {
      const groups = groupItemsByStatus(
        [
          makeItem({ id: "a", status: "watching" }),
          makeItem({ id: "b", status: "watching" }),
          makeItem({ id: "c", status: "watching" }),
        ],
        STATUSES
      );
      expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    });

    it("sorts by status order even when definitions arrive unsorted", () => {
      const unsorted = [...STATUSES].sort((a, b) => b.order - a.order);
      const groups = groupItemsByStatus(
        [makeItem({ id: "a", status: "completed" }), makeItem({ id: "b", status: "planned" })],
        unsorted
      );
      expect(groups.map((g) => g.status.id)).toEqual(["planned", "completed"]);
    });

    it("appends items with unknown statuses in a synthetic group at the end", () => {
      const groups = groupItemsByStatus(
        [
          makeItem({ id: "a", status: "watching" }),
          makeItem({ id: "b", status: "custom_gone" }),
          makeItem({ id: "c", status: "custom_gone" }),
        ],
        STATUSES
      );
      expect(groups.map((g) => g.status.id)).toEqual(["watching", "custom_gone"]);
      const last = groups.at(-1)!;
      expect(last.status.label).toBe("custom_gone");
      expect(last.status.isCore).toBe(false);
      expect(last.items.map((i) => i.id)).toEqual(["b", "c"]);
    });
  });

  describe("shouldGroupByStatus", () => {
    it("follows the grouping setting when it is on", () => {
      expect(shouldGroupByStatus(true, "all", STATUSES)).toBe(true);
      expect(shouldGroupByStatus(true, "watching", STATUSES)).toBe(true);
    });

    it("groups a public status tab even with the setting off", () => {
      expect(shouldGroupByStatus(false, "share_1", STATUSES)).toBe(true);
    });

    it("stays flat for private tabs and All with the setting off", () => {
      expect(shouldGroupByStatus(false, "all", STATUSES)).toBe(false);
      expect(shouldGroupByStatus(false, "watching", STATUSES)).toBe(false);
    });
  });
});

describe("collection/hints", () => {
  const t = (key: string) => key;

  describe("buildCollectionQueryHints", () => {
    it("keeps the filter key hints", () => {
      const hints = buildCollectionQueryHints([], [], t);
      expect(hints).toContainEqual({ kind: "local", value: "year=" });
      expect(hints).toContainEqual({ kind: "local", value: "sort=date" });
    });

    it("appends operator examples with explanations", () => {
      const hints = buildCollectionQueryHints([], [], t);
      expect(hints).toContainEqual({
        kind: "local",
        value: "^title",
        subtitle: "search.operator.prefix",
        operator: true,
      });
      expect(hints).toContainEqual({
        kind: "local",
        value: "title$",
        subtitle: "search.operator.suffix",
        operator: true,
      });
      expect(hints).toContainEqual({
        kind: "local",
        value: "'exact",
        subtitle: "search.operator.exact",
        operator: true,
      });
      expect(hints).toContainEqual({
        kind: "local",
        value: "!skip",
        subtitle: "search.operator.exclude",
        operator: true,
      });
    });
  });
});

describe("collection/import", () => {
  function makeEntry(overrides: Partial<AniListEntry> = {}): AniListEntry {
    return {
      media: {
        id: 1,
        title: "Test Anime",
        titles: ["Test Anime"],
        episodes: 12,
        duration: 24,
        format: "TV",
        status: "FINISHED",
        score: 80,
        genres: ["Action"],
        tags: [],
        description: null,
        cover_url: "https://example.com/cover.jpg",
        season: null,
        season_year: 2024,
        studios: [{ id: 1, name: "Studio X" }],
        next_episode: null,
        next_airing_at: null,
        start_date: null,
        end_date: null,
        popularity: 0,
        favourites: 0,
        rankings: [],
        relations: [],
      },
      progress: 5,
      score: 80,
      list_status: "CURRENT",
      created_at: null,
      completed_at: null,
      started_at: null,
      updated_at: null,
      notes: null,
      repeat: null,
      custom_lists: [],
      ...overrides,
    };
  }

  function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
    return {
      id: "item_1",
      title: "Test Anime",
      altTitles: [],
      type: "anime",
      status: "watching",
      progressValue: 5,
      progressTotal: 12,
      progressUnit: "episodes",
      rating: 10,
      externalIds: { anilist: 1 },
      ...overrides,
    } as unknown as CollectionItem;
  }

  describe("entrySyncState", () => {
    it("maps list status, progress and score like the import would", () => {
      expect(entrySyncState(makeEntry())).toEqual({
        status: "watching",
        progressValue: 5,
        rating: 10,
      });
    });

    it("falls back to media score when the entry has no score", () => {
      const entry = makeEntry({ score: null });
      expect(entrySyncState(entry).rating).toBe(8);
    });

    it("defaults missing progress to zero", () => {
      expect(entrySyncState(makeEntry({ progress: null })).progressValue).toBe(0);
    });
  });

  describe("entryDiffers", () => {
    it("returns false when the collection item matches the entry state", () => {
      const entry = makeEntry();
      const item = makeItem({ status: "watching", progressValue: 5, rating: 10 });
      expect(entryDiffers(entry, item)).toBe(false);
    });

    it("returns true when status differs", () => {
      const entry = makeEntry({ list_status: "COMPLETED" });
      const item = makeItem({ status: "watching", progressValue: 5, rating: 10 });
      expect(entryDiffers(entry, item)).toBe(true);
    });

    it("returns true when progress differs", () => {
      const entry = makeEntry({ progress: 9 });
      const item = makeItem({ status: "watching", progressValue: 5, rating: 10 });
      expect(entryDiffers(entry, item)).toBe(true);
    });

    it("returns true when rating differs", () => {
      const entry = makeEntry({ score: 70 });
      const item = makeItem({ status: "watching", progressValue: 5, rating: 7 });
      expect(entryDiffers(entry, item)).toBe(true);
    });
  });
  describe("buildAnilistPrefill", () => {
    const media = { title: "Frieren", cover_url: "https://example.com/f.jpg" };
    it("maps current status to watching with cover", () => {
      expect(buildAnilistPrefill(media, "CURRENT")).toEqual({
        title: "Frieren",
        coverUrl: "https://example.com/f.jpg",
        status: "watching",
        rating: null,
        scoreOrigin: null,
      });
    });
    it("carries the score over with the original it came from", () => {
      expect(buildAnilistPrefill(media, "CURRENT", 85, "POINT_100")).toEqual({
        title: "Frieren",
        coverUrl: "https://example.com/f.jpg",
        status: "watching",
        rating: 8.5,
        scoreOrigin: "85/100",
      });
      expect(buildAnilistPrefill(media, "CURRENT", 3, "POINT_3")).toEqual({
        title: "Frieren",
        coverUrl: "https://example.com/f.jpg",
        status: "watching",
        rating: 10,
        scoreOrigin: ":)",
      });
    });
    it("defaults missing profile to planned", () => {
      expect(buildAnilistPrefill({ title: "X", cover_url: null }, null).status).toBe("planned");
    });
    it("maps completed and dropped", () => {
      expect(buildAnilistPrefill(media, "COMPLETED").status).toBe("completed");
      expect(buildAnilistPrefill(media, "DROPPED").status).toBe("dropped");
    });
  });

  describe("entryToWizardValues", () => {
    it("merges anilist tags into genres without duplicates", () => {
      const base = makeEntry();
      const values = entryToWizardValues({
        ...base,
        media: { ...base.media, genres: ["Action"], tags: ["School", "Action"] },
      });
      expect(values.genres).toBe("Action, School");
    });
  });

  describe("mediaToWizardValues", () => {
    const media: QuickAddMedia = {
      id: 21,
      title: "Frieren",
      titles: ["Sousou no Frieren"],
      episodes: 28,
      duration: 24,
      score: 91,
      genres: ["Adventure"],
      tags: ["Male Protagonist", "adventure"],
      description: "An elven mage journey",
      cover_url: "https://example.com/f.jpg",
      season_year: 2023,
      start_date: null,
      format: "TV",
      studios: [{ id: 1, name: "Madhouse" }],
    };
    const entry: QuickAddListEntry = { progress: 5, score: 8, list_status: "CURRENT" };

    it("takes status, progress, score and favorite from the anilist state", () => {
      const values = mediaToWizardValues(media, entry, true);
      expect(values.status).toBe("watching");
      expect(values.progressValue).toBe("5");
      expect(values.rating).toBe("8");
      expect(values.isFavorite).toBe(true);
      expect(values.externalIds).toEqual({ anilist: 21 });
    });

    it("merges tags into genres and fills media fields", () => {
      const values = mediaToWizardValues(media, entry, false);
      expect(values.genres).toBe("Adventure, Male Protagonist");
      expect(values.studio).toBe("Madhouse");
      expect(values.year).toBe("2023");
      expect(values.description).toBe("An elven mage journey");
      expect(values.progressTotal).toBe("28");
    });

    it("falls back to planned, zero progress and media score without a list entry", () => {
      const values = mediaToWizardValues(media, undefined, false);
      expect(values.status).toBe("planned");
      expect(values.progressValue).toBe("0");
      expect(values.rating).toBe("9");
      expect(values.isFavorite).toBe(false);
    });

    it("leaves rating empty when neither entry nor media has a score", () => {
      const values = mediaToWizardValues({ ...media, score: null }, undefined, false);
      expect(values.rating).toBe("");
    });

    it("maps release date, mal id, and movie format", () => {
      const values = mediaToWizardValues(
        { ...media, start_date: "2023-09-29", id_mal: 52991, format: "MOVIE" },
        undefined,
        false
      );
      expect(values.releaseDate).toBe("2023-09-29");
      expect(values.externalIds).toEqual({ anilist: 21, mal: 52991 });
      expect(values.type).toBe("movie");
    });
  });
});

describe("collection/import-progress", () => {
  describe("computeGroupProgress", () => {
    it("splits processed across groups in batch order", () => {
      const groups = [
        { name: "Watching", count: 2 },
        { name: "Completed", count: 5 },
      ];
      expect(computeGroupProgress(groups, 4)).toEqual([2, 2]);
    });

    it("returns zeros before any progress", () => {
      const groups = [{ name: "Planning", count: 3 }];
      expect(computeGroupProgress(groups, 0)).toEqual([0]);
    });

    it("caps at group counts when processed overflows", () => {
      const groups = [
        { name: "A", count: 1 },
        { name: "B", count: 2 },
      ];
      expect(computeGroupProgress(groups, 99)).toEqual([1, 2]);
    });

    it("clamps negative processed to zeros", () => {
      const groups = [{ name: "A", count: 4 }];
      expect(computeGroupProgress(groups, -5)).toEqual([0]);
    });
  });
});

describe("collection/media", () => {
  describe("stored media helpers", () => {
    it("reads empty media from null details", () => {
      expect(readStoredMedia(null)).toEqual({ stills: [], trailerYoutubeId: null });
    });

    it("reads stored stills and trailer", () => {
      expect(readStoredMedia({ stills: ["a"], trailerYoutubeId: "t", seasons: [] })).toEqual({
        stills: ["a"],
        trailerYoutubeId: "t",
      });
    });

    it("merges media while keeping seasons", () => {
      expect(
        withStoredMedia({ seasons: [{ seasonNumber: 1, episodeCount: 2, name: "S1" }] }, ["a"], "t")
      ).toEqual({
        seasons: [{ seasonNumber: 1, episodeCount: 2, name: "S1" }],
        stills: ["a"],
        trailerYoutubeId: "t",
      });
    });
  });
});

describe("collection/search", () => {
  const item = (id: string, title: string, extra: Partial<CollectionItem> = {}) =>
    ({ id, title, altTitles: [], genres: [], studio: null, ...extra }) as CollectionItem;

  describe("collection search index", () => {
    it("finds titles, aliases, genres, and studios", () => {
      const items = [
        item("a", "Frieren", { altTitles: ["Sousou no Frieren"] }),
        item("b", "Bleach", { genres: ["Action"] }),
        item("c", "Naruto", { studio: "Pierrot" }),
      ];
      const index = buildCollectionSearchIndex(items);
      expect(searchCollectionIndex(index, "sousou").map((x) => x.id)).toEqual(["a"]);
      expect(searchCollectionIndex(index, "act").map((x) => x.id)).toEqual(["b"]);
      expect(searchCollectionIndex(index, "pier").map((x) => x.id)).toEqual(["c"]);
    });
  });

  describe("collection people search", () => {
    const withPeople = item("d", "Horimiya", {
      detailsJson: {
        staff: [{ id: 1, name: "Masashi Ishihama", role: "Director" }],
        characters: [
          {
            id: 2,
            name: "Kyouko Hori",
            voiceActors: [{ id: 3, name: "Haruka Tomatsu" }],
          },
        ],
      },
    });

    it("finds staff, characters, and voice actors by name", () => {
      const index = buildCollectionSearchIndex([withPeople]);
      expect(searchCollectionIndex(index, "ishihama").map((x) => x.id)).toEqual(["d"]);
      expect(searchCollectionIndex(index, "kyouko").map((x) => x.id)).toEqual(["d"]);
      expect(searchCollectionIndex(index, "tomatsu").map((x) => x.id)).toEqual(["d"]);
    });

    it("ignores items without stored people", () => {
      const index = buildCollectionSearchIndex([item("e", "Naruto")]);
      expect(searchCollectionIndex(index, "ishihama")).toEqual([]);
    });
  });

  describe("collection search operators", () => {
    const items = [
      item("a", "Frieren", { altTitles: ["Sousou no Frieren"] }),
      item("b", "Bleach", { genres: ["Action"] }),
      item("c", "Naruto", { studio: "Pierrot" }),
    ];
    const index = buildCollectionSearchIndex(items);

    it("anchors prefixes and suffixes", () => {
      expect(searchCollectionIndex(index, "^frie").map((x) => x.id)).toEqual(["a"]);
      expect(searchCollectionIndex(index, "^ousou").map((x) => x.id)).toEqual([]);
      expect(searchCollectionIndex(index, "uto$").map((x) => x.id)).toEqual(["c"]);
    });

    it("matches exact substrings and excludes negations", () => {
      expect(searchCollectionIndex(index, "'frieren").map((x) => x.id)).toEqual(["a"]);
      expect(searchCollectionIndex(index, "frieren !sousou").map((x) => x.id)).toEqual(["a"]);
      expect(searchCollectionIndex(index, "!bleach").map((x) => x.id)).toEqual(["a", "c"]);
    });

    it("requires every positive term in one field", () => {
      expect(searchCollectionIndex(index, "^bleach bleach").map((x) => x.id)).toEqual(["b"]);
      expect(searchCollectionIndex(index, "^bleach pierrot").map((x) => x.id)).toEqual([]);
    });
  });
});

describe("collection/share", () => {
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
      id: "ideas",
      label: "Ideas,Ideas",
      color: "#f59e0b",
      order: 2,
      isCore: false,
      kind: "private",
    },
  ];

  function makeLink(items: CollectionShareDeepLink["items"]): CollectionShareDeepLink {
    return { version: 1, label: "Ideas", items };
  }

  const snapshot = {
    title: "Frieren",
    type: "anime" as const,
    year: 2023,
    status: "watching",
    externalIds: { anilist: 154587 },
    coverUrl: null,
  };

  describe("buildShareImportPlan", () => {
    it("keeps one row per snapshot item without duplicate marking", () => {
      const plan = buildShareImportPlan(
        makeLink([
          snapshot,
          {
            ...snapshot,
            title: "Unknown Show",
            externalIds: {},
            year: null,
            status: "friend_only",
          },
        ]),
        STATUSES
      );
      expect(plan.rows).toHaveLength(2);
      expect(plan.rows[0]?.snapshot.title).toBe("Frieren");
      expect(plan.rows[1]?.snapshot.title).toBe("Unknown Show");
      expect(plan.statuses).toEqual(STATUSES);
    });

    it("does not mutate the passed statuses", () => {
      const frozen = [...STATUSES];
      buildShareImportPlan(makeLink([snapshot]), STATUSES);
      expect(STATUSES).toEqual(frozen);
    });
  });
});
