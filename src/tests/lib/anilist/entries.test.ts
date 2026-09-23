import { describe, expect, it } from "vitest";

import {
  buildEntryLookup,
  defaultListSortDir,
  entryListDate,
  entryListTime,
  filterEntries,
  fuzzyDateToTime,
  getSortingLabel,
  getStatusColor,
  listSortKeys,
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
    started_at: null,
    created_at: 0,
    list_status: "CURRENT",
    media: makeMedia(),
    progress: 1,
    score: 8,
    updated_at: 0,
    notes: null,
    repeat: null,
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
  it("sorts by user score with unscored entries last in both directions", () => {
    const scored = [
      makeEntry({ score: 5, media: makeMedia({ id: 1 }) }),
      makeEntry({ score: 9, media: makeMedia({ id: 2 }) }),
      makeEntry({ score: null, media: makeMedia({ id: 3 }) }),
    ];
    expect(sortEntries(scored, "desc", "myScore").map((e) => e.score)).toEqual([9, 5, null]);
    expect(sortEntries(scored, "asc", "myScore").map((e) => e.score)).toEqual([5, 9, null]);
  });

  it("sorts by progress descending", () => {
    expect(sortEntries(entries, "desc", "progress").map((e) => e.progress)).toEqual([10, 5, 1]);
  });

  it("sorts by completion date with missing values last in both directions", () => {
    const done = [
      makeEntry({ completed_at: "2024-01-02", media: makeMedia({ id: 1 }) }),
      makeEntry({ completed_at: null, media: makeMedia({ id: 2 }) }),
      makeEntry({ completed_at: "2023-12-31", media: makeMedia({ id: 3 }) }),
    ];
    expect(sortEntries(done, "desc", "completed").map((e) => e.media.id)).toEqual([1, 3, 2]);
    expect(sortEntries(done, "asc", "completed").map((e) => e.media.id)).toEqual([3, 1, 2]);
  });

  it("sorts by release date with missing values last", () => {
    const media = [
      makeEntry({ media: makeMedia({ id: 1, start_date: "2002-10-03", popularity: 1000 }) }),
      makeEntry({ media: makeMedia({ id: 2, start_date: null, popularity: null }) }),
      makeEntry({ media: makeMedia({ id: 3, start_date: "1999-10-20", popularity: 500000 }) }),
    ];
    expect(sortEntries(media, "desc", "release").map((e) => e.media.id)).toEqual([1, 3, 2]);
    expect(sortEntries(media, "asc", "release").map((e) => e.media.id)).toEqual([3, 1, 2]);
  });
});

describe("getSortingLabel", () => {
  it("returns i18n keys for known sorts", () => {
    expect(getSortingLabel("title")).toBe("anilist.sort.title");
    expect(getSortingLabel("score")).toBe("anilist.sort.score");
    expect(getSortingLabel("myScore")).toBe("anilist.sort.myScore");
    expect(getSortingLabel("progress")).toBe("anilist.sort.progress");
    expect(getSortingLabel("completed")).toBe("anilist.sort.completed");
    expect(getSortingLabel("release")).toBe("anilist.sort.release");
    expect(getSortingLabel("status")).toBe("anilist.sort.status");
  });

  it("falls back to the raw sort key", () => {
    expect(getSortingLabel("unknown")).toBe("unknown");
  });
});

describe("defaultListSortDir", () => {
  it("uses ascending only for titles", () => {
    expect(defaultListSortDir.title).toBe("asc");
    expect(defaultListSortDir.score).toBe("desc");
    expect(defaultListSortDir.myScore).toBe("desc");
    expect(defaultListSortDir.progress).toBe("desc");
    expect(defaultListSortDir.completed).toBe("desc");
    expect(defaultListSortDir.release).toBe("desc");
    expect(defaultListSortDir.status).toBe("asc");
  });

  it("covers every list sort key", () => {
    expect(Object.keys(defaultListSortDir).sort()).toEqual([...listSortKeys].sort());
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
            notes: "my note",
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
      created_at: 0,
      updated_at: 0,
      completed_at: null,
      started_at: null,
      notes: "my note",
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

describe("entryListDate", () => {
  const base = {
    progress: null,
    score: null,
    created_at: 1700000000,
    updated_at: 1700000001,
    completed_at: null,
    started_at: null,
    notes: null,
  };

  it("returns null without an entry", () => {
    expect(entryListDate(undefined, "en")).toBeNull();
  });

  it("uses the completion date for completed entries", () => {
    expect(
      entryListDate({ ...base, list_status: "COMPLETED", completed_at: "2024-03-09" }, "en")
    ).toBe("3/9/2024");
  });

  it("uses the start date for watching entries", () => {
    expect(entryListDate({ ...base, list_status: "CURRENT", started_at: "2023-05-02" }, "en")).toBe(
      "5/2/2023"
    );
  });

  it("uses the add date for planning entries", () => {
    expect(typeof entryListDate({ ...base, list_status: "PLANNING" }, "en")).toBe("string");
  });

  it("walks the full fallback chain before the update time", () => {
    expect(entryListDate({ ...base, list_status: "COMPLETED" }, "en")).toBe(
      entryListDate({ ...base, list_status: "PLANNING", updated_at: null }, "en")
    );
  });

  it("returns null when nothing usable exists", () => {
    expect(
      entryListDate(
        {
          progress: null,
          score: null,
          list_status: "PLANNING",
          created_at: null,
          updated_at: null,
          completed_at: null,
          started_at: null,
          notes: null,
        },
        "en"
      )
    ).toBeNull();
  });
});

describe("entryListDate fallback", () => {
  it("uses the fallback when the entry is missing", () => {
    expect(entryListDate(undefined, "en", "1999-10-20")).toBe("1999-10-20");
  });

  it("uses the fallback when no status date exists", () => {
    expect(
      entryListDate(
        {
          progress: null,
          score: null,
          list_status: "COMPLETED",
          created_at: null,
          updated_at: null,
          completed_at: null,
          started_at: null,
          notes: null,
        },
        "en",
        "1999-10-20"
      )
    ).toBe("1999-10-20");
  });
});

describe("entryListTime", () => {
  const base = {
    progress: null,
    score: null,
    created_at: 1700000000,
    updated_at: 1700000001,
    completed_at: null,
    started_at: null,
    notes: null,
  };

  it("returns null without an entry", () => {
    expect(entryListTime(undefined)).toBeNull();
  });

  it("uses the completion date for completed entries", () => {
    expect(entryListTime({ ...base, list_status: "COMPLETED", completed_at: "2024-03-09" })).toBe(
      new Date(2024, 2, 9).getTime()
    );
  });

  it("uses the start date for watching entries", () => {
    expect(entryListTime({ ...base, list_status: "CURRENT", started_at: "2023-05-02" })).toBe(
      new Date(2023, 4, 2).getTime()
    );
  });

  it("uses unix timestamps in milliseconds otherwise", () => {
    expect(entryListTime({ ...base, list_status: "PLANNING" })).toBe(1700000000000);
    expect(entryListTime({ ...base, list_status: "COMPLETED" })).toBe(1700000000000);
  });

  it("prefers start and add dates over the update time", () => {
    expect(entryListTime({ ...base, list_status: "COMPLETED", started_at: "2023-05-02" })).toBe(
      new Date(2023, 4, 2).getTime()
    );
    expect(entryListTime({ ...base, list_status: "CURRENT", updated_at: null })).toBe(
      1700000000000
    );
  });

  it("returns null when nothing usable exists", () => {
    expect(
      entryListTime({
        progress: null,
        score: null,
        list_status: "PLANNING",
        created_at: null,
        updated_at: null,
        completed_at: null,
        started_at: null,
        notes: null,
      })
    ).toBeNull();
  });
});

describe("fuzzyDateToTime", () => {
  it("parses full dates as local midnight", () => {
    expect(fuzzyDateToTime("2024-03-09")).toBe(new Date(2024, 2, 9).getTime());
  });

  it("rejects empty and malformed values", () => {
    expect(fuzzyDateToTime(null)).toBeNull();
    expect(fuzzyDateToTime("")).toBeNull();
    expect(fuzzyDateToTime("March 2024")).toBeNull();
  });
});

describe("sortEntries by media status", () => {
  const byStatus = (status: string, id: number) => makeEntry({ media: makeMedia({ id, status }) });
  const entries = [
    byStatus("CANCELLED", 1),
    byStatus("NOT_YET_RELEASED", 2),
    byStatus("RELEASING", 3),
    byStatus("FINISHED", 4),
    byStatus("HIATUS", 5),
  ];

  it("orders releasing first and cancelled last ascending", () => {
    expect(sortEntries(entries, "asc", "status").map((e) => e.media.id)).toEqual([3, 4, 2, 5, 1]);
  });

  it("reverses the order descending", () => {
    expect(sortEntries(entries, "desc", "status").map((e) => e.media.id)).toEqual([1, 5, 2, 4, 3]);
  });
});
