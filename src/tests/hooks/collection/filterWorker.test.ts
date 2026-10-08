import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FILTERS } from "@/config/collection/filters.config";
import { DEFAULT_TAG_TOLERANCES } from "@/config/search/tolerance.config";
import { useCollectionFilterWorker } from "@/hooks/collection/filterWorker.hook";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [];

beforeEach(() => {
  vi.stubGlobal("Worker", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  item("a", "Frieren", { altTitles: ["Sousou no Frieren"] }),
  item("b", "Bleach"),
  item("c", "Naruto"),
];

function setup(query: string, items: CollectionItem[] = ITEMS) {
  return renderHook(({ q, list }) => useCollectionFilterWorker({
    items: list,
    statuses: STATUSES,
    searchQuery: q,
    selectedStatus: "all",
    filters: DEFAULT_FILTERS,
    sortBy: "date",
    sortDir: "desc",
    intentEnabled: true,
    tagTolerances: DEFAULT_TAG_TOLERANCES,
  }), { initialProps: { q: query, list: items } });
}

describe("useCollectionFilterWorker", () => {
  it("shows every item for an empty query without going stale", () => {
    const { result } = setup("");
    expect(result.current.filtered.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(result.current.isStale).toBe(false);
  });

  it("filters through the sync fallback when no Worker exists", () => {
    const { result, rerender } = setup("");
    rerender({ q: "frie", list: ITEMS });
    expect(result.current.filtered.map((entry) => entry.id)).toEqual(["a"]);
    expect(result.current.isStale).toBe(false);
  });

  it("re-resolves when the item list changes", () => {
    const { result, rerender } = setup("bleach");
    expect(result.current.filtered.map((entry) => entry.id)).toEqual(["b"]);
    rerender({ q: "bleach", list: [ITEMS[0]!, ITEMS[2]!] });
    expect(result.current.filtered.map((entry) => entry.id)).toEqual([]);
  });
});
