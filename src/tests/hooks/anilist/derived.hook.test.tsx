import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAnilistEntries, useAnilistIdentity } from "@/hooks/anilist/derived.hook";
import { ALL_LISTS_ID } from "@/lib/anilist/anilistGroup.utils";
import { anilistFriendsAtoms } from "@/store/anilist.store";
import type {
  AniListCollection,
  AniListEntry,
  AniMedia,
  AnilistRouteData,
} from "@/types/anilist/anilist";

const media = (id: number, title: string, overrides: Partial<AniMedia> = {}): AniMedia => ({
  id,
  title,
  titles: [title],
  episodes: 12,
  duration: 24,
  format: "TV",
  status: "FINISHED",
  score: null,
  genres: [],
  tags: [],
  description: null,
  cover_url: null,
  season: null,
  season_year: 2024,
  studios: [],
  next_episode: null,
  next_airing_at: null,
  start_date: null,
  end_date: null,
  popularity: null,
  favourites: null,
  rankings: [],
  relations: [],
  ...overrides,
});

const entry = (item: AniMedia): AniListEntry => ({
  media: item,
  progress: 0,
  score: null,
  list_status: "CURRENT",
  created_at: null,
  completed_at: null,
  started_at: null,
  updated_at: null,
  notes: null,
  repeat: null,
  custom_lists: [],
});

const collection = (name: string, entries: AniListEntry[]): AniListCollection => ({
  name,
  entries,
});

afterEach(() => {
  anilistFriendsAtoms.friends.set([]);
});

describe("useAnilistIdentity", () => {
  it("builds favourite, friend and list id sets from route data", () => {
    const first = media(1, "Alpha");
    const second = media(2, "Beta");
    const data: AnilistRouteData = {
      user: { id: 7, name: "me", avatar: null, anime_count: 0, episodes_watched: 0, mean_score: null, score_format: null },
      lists: [collection("Watching", [entry(first)]), collection("Completed", [entry(second)])],
      favourites: [
        { id: 1, title: { romaji: "Alpha", english: null }, cover_image: null, mean_score: null, format: null },
      ],
      people: {
        staff: [{ id: 10, name: "Director", image: null }],
        characters: [{ id: 20, name: "Hero", image: null }],
      },
    };
    anilistFriendsAtoms.friends.set([
      { id: 100, name: "friend", avatar: null, added_at: 1 },
      { id: 100, name: "friend", avatar: null, added_at: 1 },
    ]);

    const { result } = renderHook(() =>
      useAnilistIdentity({ data, lists: data.lists, favourites: data.favourites })
    );

    expect([...result.current.favouriteIds]).toEqual([1]);
    expect([...result.current.favouriteStaffIds]).toEqual([10]);
    expect([...result.current.favouriteCharacterIds]).toEqual([20]);
    expect(result.current.friendIds).toEqual([100]);
    expect(result.current.allAnimeIds).toEqual([1, 2]);
    expect(result.current.listIds).toEqual([ALL_LISTS_ID, "Watching", "Completed"]);
    expect(result.current.hasFavourites).toBe(true);
  });

  it("keeps empty lists out of the tab cycle and reports no favourites", () => {
    const data: AnilistRouteData = {
      user: null,
      lists: [collection("Watching", []), collection("Completed", [])],
      favourites: [],
      people: { staff: [], characters: [] },
    };

    const { result } = renderHook(() =>
      useAnilistIdentity({ data, lists: data.lists, favourites: data.favourites })
    );

    expect(result.current.listIds).toEqual([ALL_LISTS_ID]);
    expect(result.current.friendIds).toEqual([]);
    expect(result.current.hasFavourites).toBe(false);
  });
});

describe("useAnilistEntries", () => {
  const action = media(1, "Alpha", { tags: ["Action"], score: 70 });
  const drama = media(2, "Beta", { tags: ["Drama"], score: 90 });
  const lists = [collection("Watching", [entry(action), entry(drama)])];

  const mount = (overrides: Partial<Parameters<typeof useAnilistEntries>[0]> = {}) =>
    renderHook(() =>
      useAnilistEntries({
        lists,
        currentList: "Watching",
        sort: { key: "title", dir: "asc" },
        searchTerms: "",
        filterTerms: "",
        global: false,
        filters: undefined,
        localFilter: null,
        searchResults: [],
        globalSort: { key: "score", dir: "desc" },
        ...overrides,
      })
    );

  it("returns the active, filtered and display entries for the current list", () => {
    const { result } = mount();

    expect(result.current.activeEntries).toHaveLength(2);
    expect(result.current.filteredEntries).toHaveLength(2);
    expect(result.current.displayEntries.map((item) => item.title)).toEqual(["Alpha", "Beta"]);
    expect(result.current.isLocal).toBe(false);
    expect(result.current.localSearchActive).toBe(false);
  });

  it("applies the local text and tag filters", () => {
    const { result } = mount({
      searchTerms: "beta",
      filterTerms: "beta",
      localFilter: { kind: "tag", value: "Action" },
    });

    expect(result.current.filteredEntries).toHaveLength(0);
    expect(result.current.localSearchActive).toBe(true);

    const textOnly = mount({ searchTerms: "beta", filterTerms: "beta" });
    expect(textOnly.result.current.displayEntries.map((item) => item.title)).toEqual(["Beta"]);
  });

  it("uses global search results in the display order", () => {
    const { result } = mount({ global: true, searchResults: [action, drama] });

    expect(result.current.isLocal).toBe(false);
    expect(result.current.displayEntries.map((item) => item.id)).toEqual([2, 1]);
  });
});
