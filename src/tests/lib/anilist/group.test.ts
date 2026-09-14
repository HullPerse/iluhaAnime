import { describe, expect, it } from "vitest";

import {
  ALL_LISTS_ID,
  activeListEntries,
  collectAllEntries,
  groupEntriesByList,
} from "@/lib/anilist/group.utils";
import type { AniListCollection, AniListEntry, AniMedia } from "@/types/anilist";

function makeMedia(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    cover_url: null,
    description: null,
    duration: 23,
    end_date: null,
    episodes: 12,
    favourites: 0,
    format: "TV",
    genres: [],
    id: 1,
    next_airing_at: null,
    next_episode: null,
    popularity: 0,
    rankings: [],
    relations: [],
    score: null,
    season: null,
    season_year: null,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "Title",
    titles: [],
    ...overrides,
  };
}

function makeEntry(mediaId: number, title: string): AniListEntry {
  return {
    completed_at: null,
    started_at: null,
    created_at: 0,
    list_status: "CURRENT",
    media: makeMedia({ id: mediaId, title }),
    progress: null,
    score: null,
    updated_at: 0,
  };
}

function makeList(name: string, ids: number[]): AniListCollection {
  return { name, entries: ids.map((id) => makeEntry(id, `${name} ${id}`)) };
}

describe("groupEntriesByList", () => {
  it("groups entries by owning list in site order", () => {
    const lists = [makeList("Planning", [3]), makeList("Current", [1, 2])];
    const flat = [...lists[1].entries, ...lists[0].entries];
    const groups = groupEntriesByList(flat, lists);
    expect(groups.map((g) => g.name)).toEqual(["Planning", "Current"]);
    expect(groups.map((g) => g.entries.map((e) => e.media.id))).toEqual([[3], [1, 2]]);
  });

  it("skips lists without entries", () => {
    const lists = [makeList("Current", [1]), makeList("Completed", [])];
    const groups = groupEntriesByList([...lists[0].entries], lists);
    expect(groups.map((g) => g.name)).toEqual(["Current"]);
  });

  it("preserves the caller sort order inside a group", () => {
    const lists = [makeList("Current", [1, 2, 3])];
    const head = lists[0].entries.filter((entry) => entry.media.id !== 1);
    const tail = lists[0].entries.filter((entry) => entry.media.id === 1);
    const groups = groupEntriesByList([...head, ...tail], lists);
    expect(groups[0]?.entries.map((e) => e.media.id)).toEqual([2, 3, 1]);
  });

  it("keeps custom list names as group names", () => {
    const lists = [makeList("On Hold Custom", [7])];
    const groups = groupEntriesByList([...lists[0].entries], lists);
    expect(groups[0]?.name).toBe("On Hold Custom");
  });

  it("skips entries owned by no list", () => {
    const lists = [makeList("Current", [1])];
    const groups = groupEntriesByList([...lists[0].entries, makeEntry(99, "Ghost")], lists);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((e) => e.media.id)).toEqual([1]);
  });

  it("returns no groups for empty input", () => {
    expect(groupEntriesByList([], [makeList("Current", [1])])).toEqual([]);
  });

  it("renders an entry shared by two lists once in the owning group", () => {
    const lists = [makeList("Current", [1, 2]), makeList("Custom", [2, 3])];
    const flat = lists.flatMap((list) => list.entries);
    const groups = groupEntriesByList(flat, lists);
    expect(groups.map((g) => g.entries.map((e) => e.media.id))).toEqual([
      [1, 2],
      [3],
    ]);
  });
});

describe("collectAllEntries", () => {
  it("flattens lists in site order", () => {
    const lists = [makeList("Current", [1, 2]), makeList("Planning", [3])];
    expect(collectAllEntries(lists).map((e) => e.media.id)).toEqual([1, 2, 3]);
  });

  it("keeps the first occurrence of duplicated media", () => {
    const lists = [makeList("Current", [1]), makeList("Custom", [1, 2])];
    const all = collectAllEntries(lists);
    expect(all.map((e) => e.media.id)).toEqual([1, 2]);
    expect(all[0]?.media.title).toBe("Current 1");
  });

  it("returns an empty array for empty lists", () => {
    expect(collectAllEntries([])).toEqual([]);
    expect(collectAllEntries([makeList("Current", [])])).toEqual([]);
  });
});

describe("activeListEntries", () => {
  it("returns every entry deduplicated for the all sentinel", () => {
    const lists = [makeList("Current", [1]), makeList("Custom", [1, 2])];
    expect(activeListEntries(lists, ALL_LISTS_ID).map((e) => e.media.id)).toEqual([1, 2]);
  });

  it("returns one list by name and an empty array for unknown names", () => {
    const lists = [makeList("Current", [1, 2]), makeList("Planning", [3])];
    expect(activeListEntries(lists, "Planning").map((e) => e.media.id)).toEqual([3]);
    expect(activeListEntries(lists, "Missing")).toEqual([]);
  });
});
