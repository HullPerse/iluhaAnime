import { describe, expect, it } from "vitest";

import { PUBLIC_STATUS_MAX_ITEMS } from "@/config/collection/statuses.config";
import {
  applyCollectionFilters,
  filterCollectionItems,
  pickRandomItem,
} from "@/lib/collection/filter.utils";
import { groupItemsByStatus, shouldGroupByStatus } from "@/lib/collection/group.utils";
import { buildCollectionQueryHints } from "@/lib/collection/hints.utils";
import {
  buildAnilistPrefill,
  entryDiffers,
  entrySyncState,
  entryToWizardValues,
  mediaToWizardValues,
} from "@/lib/collection/import.utils";
import { computeGroupProgress } from "@/lib/collection/importProgress.utils";
import { readStoredMedia, withStoredMedia } from "@/lib/collection/media.utils";
import { buildCollectionSearchIndex, searchCollectionIndex } from "@/lib/collection/search.utils";
import { buildShareImportPlan } from "@/lib/collection/share.utils";
import { calculateCollectionStats } from "@/lib/collection/stats.utils";
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
} from "@/lib/collection/status.utils";
import {
  buildWizardItem,
  mergeGenreTags,
  resolveFinishedAt,
  wizardDefaultsDates,
  wizardDefaultsIdentity,
  wizardDefaultsMedia,
  wizardDefaultsMeta,
  wizardDefaultsProgress,
} from "@/lib/collection/wizard.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { AniListEntry } from "@/types/anilist";
import type {
  CollectionItem,
  CollectionStatusDef,
  CollectionType,
  QuickAddListEntry,
  QuickAddMedia,
  WizardSaveValues,
} from "@/types/collection";
import type { CollectionShareDeepLink } from "@/types/deeplink";

describe("collection/filter", () => {
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

  const DEFAULT_FILTERS = {
    ratingMin: null,
    ratingMax: null,
    yearFrom: null,
    yearTo: null,
    provider: "any" as const,
    linked: "any" as const,
    hasNote: "any" as const,
    mediaTypes: [] as unknown as CollectionType[],
    genres: [] as string[],
  } as const;

  describe("filterCollectionItems", () => {
    it("returns all items for an empty query and no filters", () => {
      const items = [makeItem(), makeItem({ id: "b" }), makeItem({ id: "c" })];
      const result = filterCollectionItems(items, [], "all", "", DEFAULT_FILTERS, "date", "desc");
      expect(result).toHaveLength(3);
    });

    it("uses the FTS search results for queries of 3+ chars", () => {
      const a = makeItem({ id: "a", title: "Naruto" });
      const b = makeItem({ id: "b", title: "Bleach" });
      const result = filterCollectionItems(
        [a, b],
        [a],
        "all",
        "nar",
        DEFAULT_FILTERS,
        "date",
        "desc"
      );
      expect(result.map((i) => i.id)).toEqual(["a"]);
    });

    it("matches short queries client-side against title, alt titles, genres, and studio", () => {
      const byTitle = makeItem({ id: "title", title: "Naruto" });
      const byAlt = makeItem({ id: "alt", title: "One Piece", altTitles: ["Naruto (JP)"] });
      const byGenre = makeItem({ id: "genre", title: "Frieren", genres: ["Adventure"] });
      const byStudio = makeItem({ id: "studio", title: "Bleach", studio: "Shaft" });
      const other = makeItem({ id: "other", title: "Cowboy Bebop" });
      const items = [byTitle, byAlt, byGenre, byStudio, other];

      expect(
        filterCollectionItems(items, [], "all", "na", DEFAULT_FILTERS, "date", "desc").map(
          (i) => i.id
        )
      ).toEqual(["title", "alt"]);
      expect(
        filterCollectionItems(items, [], "all", "ad", DEFAULT_FILTERS, "date", "desc").map(
          (i) => i.id
        )
      ).toEqual(["genre"]);
      expect(
        filterCollectionItems(items, [], "all", "ha", DEFAULT_FILTERS, "date", "desc").map(
          (i) => i.id
        )
      ).toEqual(["studio"]);
    });

    it("is case-insensitive for short queries", () => {
      const a = makeItem({ id: "a", title: "Naruto" });
      const result = filterCollectionItems([a], [], "all", "NA", DEFAULT_FILTERS, "date", "desc");
      expect(result.map((i) => i.id)).toEqual(["a"]);
    });

    it("applies operators on short queries", () => {
      const byTitle = makeItem({ id: "title", title: "Naruto" });
      const byAlt = makeItem({ id: "alt", title: "One Piece", altTitles: ["Naruto (JP)"] });
      const byGenre = makeItem({ id: "genre", title: "Frieren", genres: ["Adventure"] });
      const other = makeItem({ id: "other", title: "Cowboy Bebop" });
      const items = [byTitle, byAlt, byGenre, other];

      expect(
        filterCollectionItems(items, [], "all", "^na", DEFAULT_FILTERS, "date", "desc").map(
          (i) => i.id
        )
      ).toEqual(["title", "alt"]);
      expect(
        filterCollectionItems(items, [], "all", "!na", DEFAULT_FILTERS, "date", "desc").map(
          (i) => i.id
        )
      ).toEqual(["genre", "other"]);
    });

    it("counts the effective length without markers for routing", () => {
      const a = makeItem({ id: "a", title: "Naruto" });
      const b = makeItem({ id: "b", title: "Bleach" });
      const result = filterCollectionItems(
        [a, b],
        [b],
        "all",
        "^ab",
        DEFAULT_FILTERS,
        "date",
        "desc"
      );
      expect(result.map((i) => i.id)).toEqual([]);
    });

    it("filters by selected status", () => {
      const watching = makeItem({ id: "w", status: "watching" });
      const planned = makeItem({ id: "p", status: "planned" });
      const result = filterCollectionItems(
        [watching, planned],
        [],
        "watching",
        "",
        DEFAULT_FILTERS,
        "date",
        "desc"
      );
      expect(result.map((i) => i.id)).toEqual(["w"]);
    });

    it("keeps a public status out of All while its own tab still opens", () => {
      const own = makeItem({ id: "own", status: "watching" });
      const shared = makeItem({ id: "shared", status: "share_1" });
      const statuses: CollectionStatusDef[] = [
        {
          id: "watching",
          label: "Watching",
          color: "#3b82f6",
          order: 0,
          isCore: true,
          kind: "private",
        },
        {
          id: "share_1",
          label: "Friends",
          color: "#0ea5e9",
          order: 1,
          isCore: false,
          kind: "public",
        },
      ];

      const all = filterCollectionItems(
        [own, shared],
        [],
        "all",
        "",
        DEFAULT_FILTERS,
        "date",
        "desc",
        statuses
      );
      expect(all.map((i) => i.id)).toEqual(["own"]);

      const opened = filterCollectionItems(
        [own, shared],
        [],
        "share_1",
        "",
        DEFAULT_FILTERS,
        "date",
        "desc",
        statuses
      );
      expect(opened.map((i) => i.id)).toEqual(["shared"]);
    });

    it("sorts by date descending (newest first) by default", () => {
      const old = makeItem({ id: "old", updatedAt: 100 });
      const mid = makeItem({ id: "mid", updatedAt: 200 });
      const fresh = makeItem({ id: "fresh", updatedAt: 300 });
      expect(
        filterCollectionItems(
          [old, fresh, mid],
          [],
          "all",
          "",
          DEFAULT_FILTERS,
          "date",
          "desc"
        ).map((i) => i.id)
      ).toEqual(["fresh", "mid", "old"]);
      expect(
        filterCollectionItems([old, fresh, mid], [], "all", "", DEFAULT_FILTERS, "date", "asc").map(
          (i) => i.id
        )
      ).toEqual(["old", "mid", "fresh"]);
    });

    it("sorts by name in both directions", () => {
      const bleach = makeItem({ id: "b", title: "Bleach" });
      const naruto = makeItem({ id: "n", title: "Naruto" });
      expect(
        filterCollectionItems([naruto, bleach], [], "all", "", DEFAULT_FILTERS, "name", "asc").map(
          (i) => i.id
        )
      ).toEqual(["b", "n"]);
      expect(
        filterCollectionItems([naruto, bleach], [], "all", "", DEFAULT_FILTERS, "name", "desc").map(
          (i) => i.id
        )
      ).toEqual(["n", "b"]);
    });

    it("sorts by rating with unrated items last in descending order", () => {
      const high = makeItem({ id: "high", rating: 9 });
      const mid = makeItem({ id: "mid", rating: 5 });
      const unrated = makeItem({ id: "unrated", rating: null });
      expect(
        filterCollectionItems(
          [unrated, high, mid],
          [],
          "all",
          "",
          DEFAULT_FILTERS,
          "rating",
          "desc"
        ).map((i) => i.id)
      ).toEqual(["high", "mid", "unrated"]);
      expect(
        filterCollectionItems(
          [unrated, high, mid],
          [],
          "all",
          "",
          DEFAULT_FILTERS,
          "rating",
          "asc"
        ).map((i) => i.id)
      ).toEqual(["unrated", "mid", "high"]);
    });

    it("sorts by release year with unknown years last in descending order", () => {
      const old = makeItem({ id: "old", year: 1999 });
      const fresh = makeItem({ id: "fresh", year: 2025 });
      const unknown = makeItem({ id: "unknown", year: null });
      expect(
        filterCollectionItems(
          [unknown, old, fresh],
          [],
          "all",
          "",
          DEFAULT_FILTERS,
          "year",
          "desc"
        ).map((i) => i.id)
      ).toEqual(["fresh", "old", "unknown"]);
    });
  });

  describe("applyCollectionFilters", () => {
    it("returns the input unchanged when every filter is the default", () => {
      const items = [makeItem(), makeItem({ id: "b", rating: null })];
      expect(applyCollectionFilters(items, DEFAULT_FILTERS)).toEqual(items);
    });

    it("filters by minimum rating, dropping unrated items", () => {
      const high = makeItem({ id: "high", rating: 9 });
      const low = makeItem({ id: "low", rating: 5 });
      const unrated = makeItem({ id: "unrated", rating: null });
      const result = applyCollectionFilters([high, low, unrated], {
        ...DEFAULT_FILTERS,
        ratingMin: 8,
      });
      expect(result.map((i) => i.id)).toEqual(["high"]);
    });

    it("filters by year range and drops items without a year", () => {
      const old = makeItem({ id: "old", year: 1999 });
      const mid = makeItem({ id: "mid", year: 2005 });
      const new_ = makeItem({ id: "new", year: 2015 });
      const noYear = makeItem({ id: "noYear", year: null });
      expect(
        applyCollectionFilters([old, mid, new_, noYear], {
          ...DEFAULT_FILTERS,
          yearFrom: 2000,
        }).map((i) => i.id)
      ).toEqual(["mid", "new"]);
      expect(
        applyCollectionFilters([old, mid, new_, noYear], {
          ...DEFAULT_FILTERS,
          yearTo: 2005,
        }).map((i) => i.id)
      ).toEqual(["old", "mid"]);
    });

    it("filters by provider anilist and tmdb", () => {
      const anilist = makeItem({ id: "a", externalIds: { anilist: 20 } });
      const tmdb = makeItem({ id: "t", externalIds: { tmdb: 123 } });
      const both = makeItem({
        id: "both",
        externalIds: { anilist: 1, tmdb: 2 },
      });
      const custom = makeItem({ id: "c" });
      expect(
        applyCollectionFilters([anilist, tmdb, both, custom], {
          ...DEFAULT_FILTERS,
          provider: "anilist",
        }).map((i) => i.id)
      ).toEqual(["a", "both"]);
      expect(
        applyCollectionFilters([anilist, tmdb, both, custom], {
          ...DEFAULT_FILTERS,
          provider: "tmdb",
        }).map((i) => i.id)
      ).toEqual(["t", "both"]);
    });

    it("filters by provider custom, keeping items without any external id", () => {
      const anilist = makeItem({ id: "a", externalIds: { anilist: 20 } });
      const custom = makeItem({ id: "c" });
      const result = applyCollectionFilters([anilist, custom], {
        ...DEFAULT_FILTERS,
        provider: "custom",
      });
      expect(result.map((i) => i.id)).toEqual(["c"]);
    });

    it("filters by local file link presence", () => {
      const linked = makeItem({ id: "linked", localPath: "C:\\Anime\\Naruto" });
      const unlinked = makeItem({ id: "unlinked", localPath: null });
      expect(
        applyCollectionFilters([linked, unlinked], {
          ...DEFAULT_FILTERS,
          linked: "yes",
        }).map((i) => i.id)
      ).toEqual(["linked"]);
      expect(
        applyCollectionFilters([linked, unlinked], {
          ...DEFAULT_FILTERS,
          linked: "no",
        }).map((i) => i.id)
      ).toEqual(["unlinked"]);
    });

    it("filters by note presence, treating whitespace-only notes as absent", () => {
      const noted = makeItem({ id: "noted", notes: "Rewatch later." });
      const blank = makeItem({ id: "blank", notes: "   " });
      const none = makeItem({ id: "none", notes: null });
      expect(
        applyCollectionFilters([noted, blank, none], {
          ...DEFAULT_FILTERS,
          hasNote: "yes",
        }).map((i) => i.id)
      ).toEqual(["noted"]);
      expect(
        applyCollectionFilters([noted, blank, none], {
          ...DEFAULT_FILTERS,
          hasNote: "no",
        }).map((i) => i.id)
      ).toEqual(["blank", "none"]);
    });
  });

  describe("filterCollectionItems intent operators", () => {
    const OLD = makeItem({ id: "old", title: "Old", year: 2002, rating: 8, status: "completed" });
    const MID = makeItem({ id: "mid", title: "Mid", year: 2020, rating: 6, status: "watching" });
    const FRESH = makeItem({
      id: "fresh",
      title: "Fresh",
      year: 2025,
      rating: 9,
      status: "watching",
    });
    const run = (query: string) =>
      filterCollectionItems(
        [OLD, MID, FRESH],
        [],
        "all",
        query,
        DEFAULT_FILTERS,
        "name",
        "asc"
      ).map((item) => item.id);

    it("matches an exact release year", () => {
      expect(run("year=2025")).toEqual(["fresh"]);
    });

    it("combines year comparisons as AND", () => {
      expect(run("year>2002 year<2025")).toEqual(["mid"]);
    });

    it("filters ratings with comparisons", () => {
      expect(run("rating>=8")).toEqual(["fresh", "old"]);
    });

    it("excludes exact status and studio matches", () => {
      expect(run("status!=watching")).toEqual(["old"]);
      expect(run("studio!=Pierrot")).toEqual([]);
    });

    it("matches any alternative separated by pipe", () => {
      expect(run("status=completed|watching")).toEqual(["fresh", "mid", "old"]);
      expect(run("status!=completed|watching")).toEqual([]);
      const items = [
        makeItem({ id: "a", genres: ["Action"] }),
        makeItem({ id: "b", genres: ["Drama"] }),
        makeItem({ id: "c", genres: ["Comedy"] }),
      ];
      const ids = (query: string) =>
        filterCollectionItems(items, [], "all", query, DEFAULT_FILTERS, "name", "asc").map(
          (item) => item.id
        );
      expect(ids("genre=action|drama")).toEqual(["a", "b"]);
    });

    it("overrides the sort order from the tag", () => {
      expect(run("sort=rating:asc")).toEqual(["mid", "old", "fresh"]);
      expect(run("sort=name")).toEqual(["fresh", "mid", "old"]);
    });

    it("filters by watched progress", () => {
      const items = [
        makeItem({ id: "a", progressValue: 0 }),
        makeItem({ id: "b", progressValue: 12 }),
        makeItem({ id: "c", progressValue: 30 }),
      ];
      const ids = (query: string) =>
        filterCollectionItems(items, [], "all", query, DEFAULT_FILTERS, "name", "asc").map(
          (item) => item.id
        );
      expect(ids("progress=0")).toEqual(["a"]);
      expect(ids("progress>10")).toEqual(["b", "c"]);
    });

    it("filters by release date in year and full forms", () => {
      const items = [
        makeItem({ id: "a", year: 2024, releaseDate: "2024-03-10" }),
        makeItem({ id: "b", year: 2024, releaseDate: null }),
        makeItem({ id: "c", year: null, releaseDate: "2025-01-31" }),
        makeItem({ id: "d", year: null, releaseDate: null }),
      ];
      const ids = (query: string) =>
        filterCollectionItems(items, [], "all", query, DEFAULT_FILTERS, "name", "asc").map(
          (item) => item.id
        );
      expect(ids("date=2024")).toEqual(["a", "b"]);
      expect(ids('date="31.01.2025"')).toEqual(["c"]);
      expect(ids("date>=2025-01-01")).toEqual(["c"]);
      expect(ids("date<2024-01-01")).toEqual([]);
    });
  });

  describe("pickRandomItem", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" }), makeItem({ id: "c" })];

    it("returns undefined for an empty list", () => {
      expect(pickRandomItem([])).toBeUndefined();
    });

    it("always picks the only item", () => {
      expect(pickRandomItem([items[0]], () => 0.99)?.id).toBe("a");
    });

    it("maps the random value uniformly over indices", () => {
      expect(pickRandomItem(items, () => 0)?.id).toBe("a");
      expect(pickRandomItem(items, () => 0.34)?.id).toBe("b");
      expect(pickRandomItem(items, () => 0.99)?.id).toBe("c");
    });
  });
});

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

describe("collection/wizard", () => {
  function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
    return {
      id: "item_1",
      title: "Naruto",
      altTitles: ["Naruto (JP)"],
      type: "anime",
      status: "watching",
      progressValue: 12,
      progressTotal: 220,
      progressUnit: "episodes",
      durationMinutes: 23,
      rating: 8,
      priority: "normal",
      isFavorite: true,
      year: 2002,
      releaseDate: null,
      genres: ["Action", "Adventure"],
      studio: "Pierrot",
      description: "A ninja story.",
      notes: "Rewatch later.",
      coverUrl: "https://example.com/cover.jpg",
      coverBlobId: "blob_1",
      thumbBlobId: "blob_1",
      externalIds: { anilist: 20 },
      customFields: { mood: "epic" },
      localPath: "C:\\Anime\\Naruto",
      localKind: "folder",
      startedAt: Date.UTC(2024, 0, 15),
      finishedAt: null,
      lastWatchedAt: Date.UTC(2024, 1, 1),
      rewatchCount: 2,
      addedAt: Date.UTC(2024, 0, 1),
      updatedAt: Date.UTC(2024, 0, 1),
      sitesToView: [],
      tvCurrentSeason: null,
      tvCurrentEpisode: null,
      detailsJson: null,
      ...overrides,
    };
  }

  function makeValues(overrides: Partial<WizardSaveValues> = {}): WizardSaveValues {
    return {
      title: "  Naruto  ",
      altTitles: "Naruto (JP), , Shippuden",
      type: "anime",
      status: "watching",
      progressValue: "12",
      progressTotal: "220",
      progressUnit: "episodes",
      durationMinutes: "23",
      rating: "8",
      priority: "normal",
      isFavorite: true,
      year: "2002",
      genres: "Action, Drama, ",
      studio: "  Pierrot  ",
      description: "  A ninja story.  ",
      notes: "  Rewatch later.  ",
      coverUrl: "https://example.com/cover.jpg",
      externalIds: { anilist: 20 },
      customFields: { mood: "epic" },
      localPath: "C:\\Anime\\Naruto",
      localKind: "folder",
      startedAt: "2024-01-15",
      finishedAt: "",
      ...overrides,
    };
  }

  describe("buildWizardItem", () => {
    it("trims text fields and splits comma lists, dropping empties", () => {
      const item = buildWizardItem(makeValues(), "blob_9", null);
      expect(item.title).toBe("Naruto");
      expect(item.altTitles).toEqual(["Naruto (JP)", "Shippuden"]);
      expect(item.genres).toEqual(["Action", "Drama"]);
      expect(item.studio).toBe("Pierrot");
      expect(item.description).toBe("A ninja story.");
      expect(item.notes).toBe("Rewatch later.");
    });

    it("clamps progress, total, duration, and rating to their bounds", () => {
      const item = buildWizardItem(
        makeValues({
          progressValue: "-5",
          progressTotal: "0",
          durationMinutes: "-3",
          rating: "11",
        }),
        null,
        null
      );
      expect(item.progressValue).toBe(0);
      expect(item.progressTotal).toBe(1);
      expect(item.durationMinutes).toBe(0);
      expect(item.rating).toBe(10);

      const low = buildWizardItem(makeValues({ rating: "0" }), null, null);
      expect(low.rating).toBe(1);
    });

    it("turns empty optional numbers into null", () => {
      const item = buildWizardItem(
        makeValues({
          progressTotal: "",
          durationMinutes: "",
          rating: "",
          year: "",
        }),
        null,
        null
      );
      expect(item.progressTotal).toBeNull();
      expect(item.durationMinutes).toBeNull();
      expect(item.rating).toBeNull();
      expect(item.year).toBeNull();
    });

    it("passes the cover blob id to both cover and thumb fields", () => {
      const item = buildWizardItem(makeValues(), "blob_9", null);
      expect(item.coverBlobId).toBe("blob_9");
      expect(item.thumbBlobId).toBe("blob_9");
    });

    it("converts dates to timestamps and keeps empty dates null", () => {
      const item = buildWizardItem(makeValues(), null, null);
      expect(item.startedAt).toBe(new Date("2024-01-15").getTime());
      expect(item.finishedAt).toBeNull();
    });

    it("resolves finishedAt to now for completed items without a date", () => {
      const before = Date.now();
      const item = buildWizardItem(makeValues({ status: "completed" }), null, null);
      expect(item.finishedAt).not.toBeNull();
      expect(item.finishedAt!).toBeGreaterThanOrEqual(before);
      expect(item.finishedAt!).toBeLessThanOrEqual(Date.now());
    });

    it("resolves startedAt to now for watching items without a date", () => {
      const before = Date.now();
      const item = buildWizardItem(makeValues({ status: "watching", startedAt: "" }), null, null);
      expect(item.startedAt).not.toBeNull();
      expect(item.startedAt!).toBeGreaterThanOrEqual(before);
      expect(item.startedAt!).toBeLessThanOrEqual(Date.now());
    });

    it("carries releaseDate from values and preserves it on edit", () => {
      expect(
        buildWizardItem(makeValues({ releaseDate: "2024-03-10" }), null, null).releaseDate
      ).toBe("2024-03-10");
      const initial = makeItem();
      expect(buildWizardItem(makeValues(), null, initial).releaseDate).toBe(initial.releaseDate);
    });

    it("preserves rewatch and last-watched state from the initial item", () => {
      const initial = makeItem();
      const item = buildWizardItem(makeValues(), null, initial);
      expect(item.lastWatchedAt).toBe(initial.lastWatchedAt);
      expect(item.rewatchCount).toBe(2);
    });

    it("defaults rewatch state for new items", () => {
      const item = buildWizardItem(makeValues(), null, null);
      expect(item.lastWatchedAt).toBeNull();
      expect(item.rewatchCount).toBe(0);
    });

    it("keeps external ids and custom fields as-is", () => {
      const item = buildWizardItem(makeValues(), null, null);
      expect(item.externalIds).toEqual({ anilist: 20 });
      expect(item.customFields).toEqual({ mood: "epic" });
    });
  });

  describe("resolveFinishedAt", () => {
    it("returns the parsed timestamp for an explicit date", () => {
      expect(resolveFinishedAt("planned", "2024-05-01")).toBe(new Date("2024-05-01").getTime());
    });

    it("returns null for non-completed statuses without a date", () => {
      expect(resolveFinishedAt("watching", "")).toBeNull();
    });

    it("returns now for completed statuses without a date", () => {
      const before = Date.now();
      const result = resolveFinishedAt("completed", "");
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThanOrEqual(before);
      expect(result!).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("wizardDefaultsIdentity", () => {
    it("returns defaults for a new item", () => {
      expect(wizardDefaultsIdentity(null)).toEqual({
        title: "",
        altTitles: "",
        type: "anime",
        status: "planned",
      });
    });

    it("joins alt titles and keeps the item values", () => {
      expect(wizardDefaultsIdentity(makeItem())).toEqual({
        title: "Naruto",
        altTitles: "Naruto (JP)",
        type: "anime",
        status: "watching",
      });
    });
  });

  describe("wizardDefaultsProgress", () => {
    it("returns defaults for a new item", () => {
      expect(wizardDefaultsProgress(null)).toEqual({
        progressValue: "0",
        progressTotal: "",
        progressUnit: "episodes",
        rating: "",
        priority: "normal",
        isFavorite: false,
      });
    });

    it("stringifies the item values", () => {
      expect(wizardDefaultsProgress(makeItem())).toEqual({
        progressValue: "12",
        progressTotal: "220",
        progressUnit: "episodes",
        rating: "8",
        priority: "normal",
        isFavorite: true,
      });
    });
  });

  describe("wizardDefaultsMeta", () => {
    it("returns defaults for a new item", () => {
      expect(wizardDefaultsMeta(null)).toEqual({
        year: "",
        description: "",
        durationMinutes: "",
        genres: "",
        studio: "",
      });
    });

    it("stringifies year and duration, joins genres", () => {
      expect(wizardDefaultsMeta(makeItem())).toEqual({
        year: "2002",
        description: "A ninja story.",
        durationMinutes: "23",
        genres: "Action, Adventure",
        studio: "Pierrot",
      });
    });
  });

  describe("wizardDefaultsDates", () => {
    it("returns empty strings for a new item", () => {
      expect(wizardDefaultsDates(null)).toEqual({
        startedAt: "",
        finishedAt: "",
        notes: "",
      });
    });

    it("formats timestamps as YYYY-MM-DD", () => {
      const item = makeItem({
        startedAt: Date.UTC(2024, 0, 15),
        finishedAt: Date.UTC(2024, 5, 2),
        notes: "Rewatch later.",
      });
      expect(wizardDefaultsDates(item)).toEqual({
        startedAt: "2024-01-15",
        finishedAt: "2024-06-02",
        notes: "Rewatch later.",
      });
    });
  });

  describe("wizardDefaultsMedia", () => {
    it("returns defaults for a new item", () => {
      expect(wizardDefaultsMedia(null)).toEqual({
        coverUrl: "",
        externalIds: {},
        localPath: "",
        localKind: null,
        customFields: {},
      });
    });

    it("keeps the item values", () => {
      expect(wizardDefaultsMedia(makeItem())).toEqual({
        coverUrl: "https://example.com/cover.jpg",
        externalIds: { anilist: 20 },
        localPath: "C:\\Anime\\Naruto",
        localKind: "folder",
        customFields: { mood: "epic" },
      });
    });
  });

  describe("mergeGenreTags", () => {
    it("appends tags after genres", () => {
      expect(mergeGenreTags(["Action"], ["Male Protagonist"])).toEqual([
        "Action",
        "Male Protagonist",
      ]);
    });

    it("drops duplicates case-insensitively and skips blanks", () => {
      expect(mergeGenreTags(["Action"], ["action", "  ", "Action", "Drama"])).toEqual([
        "Action",
        "Drama",
      ]);
    });

    it("keeps genres when tags are empty", () => {
      expect(mergeGenreTags(["Action"], [])).toEqual(["Action"]);
    });
  });
});
