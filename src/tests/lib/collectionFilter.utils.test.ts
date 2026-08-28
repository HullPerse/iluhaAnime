import { describe, expect, it } from "vitest";

import {
  applyCollectionFilters,
  filterCollectionItems,
} from "@/lib/collectionFilter.utils";
import type { CollectionItem } from "@/types/collection";

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

const DEFAULT_FILTERS = {
  ratingMin: null,
  yearFrom: null,
  yearTo: null,
  provider: "any",
  linked: "any",
  hasNote: "any",
} as const;

describe("filterCollectionItems", () => {
  it("returns all items for an empty query and no filters", () => {
    const items = [makeItem(), makeItem({ id: "b" }), makeItem({ id: "c" })];
    const result = filterCollectionItems(
      items,
      [],
      "all",
      "",
      DEFAULT_FILTERS,
      "date",
      "desc"
    );
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
      filterCollectionItems(
        items,
        [],
        "all",
        "na",
        DEFAULT_FILTERS,
        "date",
        "desc"
      ).map((i) => i.id)
    ).toEqual(["title", "alt"]);
    expect(
      filterCollectionItems(
        items,
        [],
        "all",
        "ad",
        DEFAULT_FILTERS,
        "date",
        "desc"
      ).map((i) => i.id)
    ).toEqual(["genre"]);
    expect(
      filterCollectionItems(
        items,
        [],
        "all",
        "ha",
        DEFAULT_FILTERS,
        "date",
        "desc"
      ).map((i) => i.id)
    ).toEqual(["studio"]);
  });

  it("is case-insensitive for short queries", () => {
    const a = makeItem({ id: "a", title: "Naruto" });
    const result = filterCollectionItems(
      [a],
      [],
      "all",
      "NA",
      DEFAULT_FILTERS,
      "date",
      "desc"
    );
    expect(result.map((i) => i.id)).toEqual(["a"]);
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
      filterCollectionItems(
        [old, fresh, mid],
        [],
        "all",
        "",
        DEFAULT_FILTERS,
        "date",
        "asc"
      ).map((i) => i.id)
    ).toEqual(["old", "mid", "fresh"]);
  });

  it("sorts by name in both directions", () => {
    const bleach = makeItem({ id: "b", title: "Bleach" });
    const naruto = makeItem({ id: "n", title: "Naruto" });
    expect(
      filterCollectionItems(
        [naruto, bleach],
        [],
        "all",
        "",
        DEFAULT_FILTERS,
        "name",
        "asc"
      ).map((i) => i.id)
    ).toEqual(["b", "n"]);
    expect(
      filterCollectionItems(
        [naruto, bleach],
        [],
        "all",
        "",
        DEFAULT_FILTERS,
        "name",
        "desc"
      ).map((i) => i.id)
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