import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS } from "@/config/anilist/collectionFilters.config";
import { DEFAULT_TAG_TOLERANCES } from "@/config/graphics/tolerance.config";
import {
  createCollectionFilterSnapshot,
  filterCollectionItems,
  queryCollectionFilterSnapshot,
} from "@/lib/core/filter.utils";
import {
  buildCollectionSearchIndex,
  searchCollectionIndex,
} from "@/lib/anilist/collectionSearch.utils";
import { parseIntent } from "@/lib/core/intent.utils";
import { operatorTextLength } from "@/lib/search/searchScore.utils";
import type { CollectionItem } from "@/types/anilist/collection";

const item = (id: string, title: string, extra: Partial<CollectionItem> = {}) =>
  ({
    id,
    title,
    altTitles: [],
    genres: [],
    studio: null,
    status: "completed",
    updatedAt: 0,
    rating: null,
    year: null,
    externalIds: {},
    localPath: null,
    ...extra,
  }) as CollectionItem;

const ITEMS = [
  item("a", "Frieren", { altTitles: ["Sousou no Frieren"], year: 2023, rating: 9 }),
  item("b", "Bleach", { genres: ["Action"], year: 2004, rating: 8 }),
  item("c", "Naruto", { studio: "Pierrot", year: 2002, rating: 8 }),
];

function legacyIds(query: string): string[] {
  const trimmed = parseIntent(query).cleanQuery.trim();
  const searchResults =
    operatorTextLength(trimmed) < 3
      ? ITEMS
      : searchCollectionIndex(buildCollectionSearchIndex(ITEMS), trimmed);
  return filterCollectionItems(
    ITEMS,
    searchResults,
    "all",
    query,
    DEFAULT_FILTERS,
    "date",
    "desc",
    [],
    {
      intentEnabled: true,
      tagTolerances: DEFAULT_TAG_TOLERANCES,
    }
  ).map((entry) => entry.id);
}

function workerIds(query: string): string[] {
  const snapshot = createCollectionFilterSnapshot(ITEMS, []);
  return queryCollectionFilterSnapshot(snapshot, {
    searchQuery: query,
    selectedStatus: "all",
    filters: DEFAULT_FILTERS,
    sortBy: "date",
    sortDir: "desc",
    intentEnabled: true,
    tagTolerances: DEFAULT_TAG_TOLERANCES,
  });
}

describe("collection filter snapshot equivalence", () => {
  it.each([[""], ["frie"], ["frieren"], ["bleach"], ["year:2020"], ["^fri"], ["no-such-title"]])(
    "matches the inline pipeline for %j",
    (query: string) => {
      expect(workerIds(query)).toEqual(legacyIds(query));
    }
  );
});
