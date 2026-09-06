import { describe, expect, it } from "vitest";

import {
  buildEntryLookup,
  filterEntries,
  getSortingLabel,
  getStatusColor,
  searchFiltersToParams,
  sortAniMediaList,
  sortEntries,
} from "@/lib/anilist/entries.utils";
import type { AniListCollection, AniListEntry, AniMedia, AniListFilters } from "@/types/anilist";

function makeMedia(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    cover_url: null,
    description: null,
    duration: 23,
    end_date: "2007-02-08",
    episodes: 220,
    favourites: 500,
    format: "TV",
    genres: ["Action"],
    id: 1,
    next_airing_at: null,
    next_episode: null,
    popularity: 1000,
    rankings: [],
    relations: [],
    score: 8,
    season: "WINTER",
    season_year: 2002,
    start_date: "2002-10-03",
    status: "FINISHED",
    studios: [{ id: 1, name: "Studio" }],
    tags: ["Ninja"],
    title: "Naruto",
    titles: ["Naruto", "Наруто"],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AniListEntry> = {}): AniListEntry {
  return {
    completed_at: null,
    created_at: 0,
    list_status: "CURRENT",
    media: makeMedia(),
    progress: 1,
    score: 8,
    updated_at: 0,
    ...overrides,
  };
}

function makeFilters(overrides: Partial<AniListFilters> = {}): AniListFilters {
  return {
    adult: false,
    country: "",
    episodes: [0, 0],
    format: "",
    genres: [],
    score: [0, 0],
    season: "",
    seasonYear: null,
    sort: "",
    source: "",
    status: "",
    tags: [],
    year: [0, 0],
    ...overrides,
  };
}

describe("filterEntries", () => {
  it("keeps everything with an empty query", () => {
    const entries = [makeEntry(), makeEntry({ media: makeMedia({ id: 2 }) })];
    expect(filterEntries(entries, "", false)).toHaveLength(2);
  });

  it("keeps everything in global mode", () => {
    const entries = [makeEntry()];
    expect(filterEntries(entries, "zzz", true)).toHaveLength(1);
  });

  it("matches the main title case-insensitively", () => {
    const entries = [makeEntry({ media: makeMedia({ title: "One Piece" }) })];
    expect(filterEntries(entries, "one piece", false)).toHaveLength(1);
    expect(filterEntries(entries, "ONE", false)).toHaveLength(1);
  });

  it("matches alternate titles", () => {
    const entries = [
      makeEntry({
        media: makeMedia({ title: "One Piece", titles: ["ワンピース"] }),
      }),
    ];
    expect(filterEntries(entries, "ワンピース", false)).toHaveLength(1);
  });
});

describe("sortEntries", () => {
  const entries = [
    makeEntry({
      media: makeMedia({ id: 1, score: 7, title: "Bleach" }),
      progress: 5,
    }),
    makeEntry({
      media: makeMedia({ id: 2, score: 9, title: "AoT" }),
      progress: 10,
    }),
    makeEntry({
      media: makeMedia({ id: 3, score: 8, title: "Naruto" }),
      progress: 1,
    }),
  ];

  it("sorts by title ascending and descending", () => {
    expect(sortEntries(entries, "asc", "title").map((e) => e.media.title)).toEqual([
      "AoT",
      "Bleach",
      "Naruto",
    ]);
    expect(sortEntries(entries, "desc", "title").map((e) => e.media.title)).toEqual([
      "Naruto",
      "Bleach",
      "AoT",
    ]);
  });

  it("sorts by score descending and ascending", () => {
    expect(sortEntries(entries, "desc", "score").map((e) => e.media.score)).toEqual([9, 8, 7]);
    expect(sortEntries(entries, "asc", "score").map((e) => e.media.score)).toEqual([7, 8, 9]);
  });

  it("sorts by progress descending", () => {
    expect(sortEntries(entries, "desc", "progress").map((e) => e.progress)).toEqual([10, 5, 1]);
  });
});

describe("getSortingLabel", () => {
  it("returns i18n keys for known sorts", () => {
    expect(getSortingLabel("title")).toBe("anilist.sort.title");
    expect(getSortingLabel("score")).toBe("anilist.sort.score");
    expect(getSortingLabel("progress")).toBe("anilist.sort.progress");
  });

  it("falls back to the raw sort key", () => {
    expect(getSortingLabel("unknown")).toBe("unknown");
  });
});

describe("getStatusColor", () => {
  it("maps known statuses to colors", () => {
    expect(getStatusColor("CURRENT")).toBe("#e6b800");
    expect(getStatusColor("COMPLETED")).toBe("#4caf50");
    expect(getStatusColor("PLANNING")).toBe("#2196f3");
  });

  it("falls back to gray for unknown statuses", () => {
    expect(getStatusColor("WEIRD" as AniListEntry["list_status"])).toBe("#888");
  });
});

describe("buildEntryLookup", () => {
  it("maps media ids to progress/score/status", () => {
    const lists: AniListCollection[] = [
      {
        entries: [
          makeEntry({
            media: makeMedia({ id: 7 }),
            progress: 3,
            score: 9,
            list_status: "CURRENT",
          }),
        ],
        name: "Watching",
      },
    ];
    const map = buildEntryLookup(lists);
    expect(map.get(7)).toEqual({
      list_status: "CURRENT",
      progress: 3,
      score: 9,
    });
    expect(map.has(1)).toBe(false);
  });
});

describe("searchFiltersToParams", () => {
  it("serializes active filters", () => {
    const params = searchFiltersToParams(
      makeFilters({
        adult: true,
        country: "JP",
        episodes: [1, 24],
        format: "TV",
        genres: ["Action"],
        score: [7, 10],
        season: "WINTER",
        seasonYear: 2002,
        sort: "SCORE_DESC",
        source: "MANGA",
        status: "FINISHED",
        tags: ["Ninja"],
        year: [1999, 2010],
      }),
      "naruto",
      40,
      3
    );
    expect(params.tags).toEqual(["Ninja"]);
    expect(params.genres).toEqual(["Action"]);
    expect(params.format).toBe("TV");
    expect(params.status).toBe("FINISHED");
    expect(params.season).toBe("WINTER");
    expect(params.seasonYear).toBe(2002);
    expect(params.sort).toEqual(["SCORE_DESC"]);
    expect(params.yearFrom).toBe(1999);
    expect(params.yearTo).toBe(2010);
    expect(params.episodesFrom).toBe(1);
    expect(params.episodesTo).toBe(24);
    expect(params.scoreFrom).toBe(7);
    expect(params.scoreTo).toBe(10);
    expect(params.perPage).toBe(40);
    expect(params.maxPages).toBe(3);
  });

  it("nullifies empty filters", () => {
    const params = searchFiltersToParams(makeFilters(), null, 20, 2);
    expect(params.query).toBeNull();
    expect(params.tags).toBeNull();
    expect(params.genres).toBeNull();
    expect(params.format).toBeNull();
    expect(params.status).toBeNull();
    expect(params.season).toBeNull();
    expect(params.sort).toBeNull();
    expect(params.yearFrom).toBeNull();
    expect(params.episodesFrom).toBeNull();
    expect(params.scoreFrom).toBeNull();
  });
});

describe("sortAniMediaList", () => {
  const results = [
    makeMedia({ id: 1, score: 7, season_year: 2004, title: "Bleach" }),
    makeMedia({ id: 2, score: 9, season_year: 2013, title: "AoT" }),
    makeMedia({ id: 3, score: 8, season_year: 2002, title: "Naruto" }),
  ];

  it("keeps relevance order untouched", () => {
    expect(sortAniMediaList(results, "relevance", "asc").map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("sorts by title", () => {
    expect(sortAniMediaList(results, "title", "asc").map((m) => m.title)).toEqual([
      "AoT",
      "Bleach",
      "Naruto",
    ]);
  });

  it("sorts by score descending by default", () => {
    expect(sortAniMediaList(results, "score", "desc").map((m) => m.score)).toEqual([9, 8, 7]);
  });

  it("sorts by year ascending", () => {
    expect(sortAniMediaList(results, "year", "asc").map((m) => m.season_year)).toEqual([
      2002, 2004, 2013,
    ]);
  });
});
