import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addSearchQuery,
  clearAllSearchLearning,
  deleteSearchFilterPreset,
  hydrateSearchLearning,
  indexSearchAniList,
  recordSearchSuggestion,
  saveSearchFilterPreset,
  searchAtoms,
} from "@/store/search.store";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist";
import type { AniMedia } from "@/types/anilist";
import type { SearchFilters } from "@/types/search";

import { mockInvoke } from "../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function animeMedia(id: number, title: string): AniMedia {
  return {
    id,
    title,
    titles: [title],
    episodes: null,
    duration: null,
    format: "TV",
    status: "FINISHED",
    score: null,
    genres: [],
    tags: [],
    description: null,
    cover_url: null,
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
  };
}

function listEntry(id: number, title: string) {
  return {
    media: animeMedia(id, title),
    progress: 0,
    score: 7,
    list_status: "COMPLETED",
    created_at: null,
    completed_at: null,
    started_at: null,
    updated_at: null,
    notes: null,
    repeat: null,
    custom_lists: [],
  };
}

function collection(): AniListCollection[] {
  return [{ name: "Completed", entries: [listEntry(20, "NARUTO")] }];
}

function favourites(): FavouriteAnime[] {
  return [];
}

function upsertCalls(): number {
  return mockInvoke.mock.calls.filter((call) => call[0] === "upsert_unified_index").length;
}

const FILTERS: SearchFilters = {
  minSeeders: 10,
  hasMagnet: false,
  quality: "1080p",
  language: "all",
  sizeMin: 0,
  sizeMax: 0,
  codec: "all",
};

beforeEach(() => {
  searchAtoms.filterPresets.set([]);
  searchAtoms.history.set([]);
  searchAtoms.queryStats.set({});
  searchAtoms.suggestionStats.set({});
  localStorage.removeItem("animeIndexSyncKey");
});

describe("filter presets", () => {
  it("saves and applies presets", () => {
    saveSearchFilterPreset("night", FILTERS);
    const filterPresets = searchAtoms.filterPresets.get();
    expect(filterPresets).toHaveLength(1);
    expect(filterPresets[0]).toEqual({ name: "night", filters: FILTERS });
  });
  it("ignores blank names and replaces same-name presets", () => {
    saveSearchFilterPreset("   ", FILTERS);
    expect(searchAtoms.filterPresets.get()).toHaveLength(0);
    saveSearchFilterPreset("night", FILTERS);
    saveSearchFilterPreset("night", { ...FILTERS, minSeeders: 99 });
    const filterPresets = searchAtoms.filterPresets.get();
    expect(filterPresets).toHaveLength(1);
    expect(filterPresets[0].filters.minSeeders).toBe(99);
  });

  it("deletes presets by name", () => {
    saveSearchFilterPreset("a", FILTERS);
    saveSearchFilterPreset("b", FILTERS);
    deleteSearchFilterPreset("a");
    expect(searchAtoms.filterPresets.get().map((p) => p.name)).toEqual(["b"]);
  });
});

describe("learning counters", () => {
  function callArgs(command: string): Record<string, unknown> | undefined {
    const call = mockInvoke.mock.calls.find((entry) => entry[0] === command);
    return call?.[1] as Record<string, unknown> | undefined;
  }

  it("writes submissions with a single use bump and updates the projection", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(null);
    addSearchQuery("  Frieren  ", "anilist");
    await vi.waitFor(() => expect(callArgs("upsert_unified_index")).toBeDefined());
    const args = callArgs("upsert_unified_index");
    expect(args?.entries).toEqual([
      expect.objectContaining({ bumpUse: true, id: "history:anilist:frieren" }),
    ]);
    expect(searchAtoms.queryStats.get()["anilist:frieren"]).toMatchObject({ count: 1 });
    expect(mockInvoke.mock.calls.filter((call) => call[0] === "upsert_unified_index")).toHaveLength(
      1
    );
  });

  it("records a selection against every matching index row", () => {
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(2);
    recordSearchSuggestion("Frieren", "anilist");
    expect(callArgs("record_unified_index_value_action")).toEqual({
      action: "select",
      scope: "anilist",
      value: "Frieren",
    });
    expect(searchAtoms.suggestionStats.get().frieren?.selectedCount).toBe(1);
  });

  it("hydrates counters from SQLite seconds", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue([
      {
        id: "history:anilist:frieren",
        ignoredCount: 0,
        kind: "history",
        lastUsedAt: nowSeconds,
        scope: "anilist",
        selectedCount: 1,
        useCount: 2,
        value: "frieren",
      },
    ]);
    await hydrateSearchLearning();
    expect(searchAtoms.queryStats.get()["anilist:frieren"]).toMatchObject({
      count: 2,
      selectedCount: 1,
    });
    expect(searchAtoms.suggestionStats.get().frieren?.selectedCount).toBe(1);
  });
});

describe("anime index sync", () => {
  it("skips the unified index write when the list is unchanged", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(null);
    indexSearchAniList(collection(), favourites(), 7);
    await vi.waitFor(() => expect(upsertCalls()).toBeGreaterThan(0));
    const first = upsertCalls();
    expect(localStorage.getItem("animeIndexSyncKey")).toMatch(/^\d+:-?\d+$/);
    indexSearchAniList(collection(), favourites(), 7);
    expect(searchAtoms.animeIndex.get()).toHaveLength(1);
    expect(upsertCalls()).toBe(first);
    expect(searchAtoms.animeIndex.get()).toHaveLength(1);
  });

  it("syncs again after the list changes or learning is pruned", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(null);
    indexSearchAniList(collection(), favourites(), 8);
    await vi.waitFor(() => expect(upsertCalls()).toBeGreaterThan(0));
    const first = upsertCalls();
    indexSearchAniList(
      [{ name: "Completed", entries: [listEntry(20, "NARUTO"), listEntry(21, "ONE PIECE")] }],
      favourites(),
      7
    );
    await vi.waitFor(() => expect(upsertCalls()).toBeGreaterThan(first));
    await clearAllSearchLearning();
    indexSearchAniList(collection(), favourites(), 7);
    await vi.waitFor(() => expect(upsertCalls()).toBeGreaterThan(first));
  });
});
