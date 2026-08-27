import { describe, expect, it } from "vitest";

import {
  buildActivityMap,
  buildYearGrid,
  dayKey,
  formatActivityTime,
  groupLabel,
  monthLabel,
  type ActivityTranslate,
  type DayActivity,
} from "@/lib/activity.anilist.utils";
import type {
  AniListCollection,
  AniListEntry,
  AniMedia,
} from "@/types/anilist";

function makeT(): ActivityTranslate {
  return (key, variables) => {
    if (key === "anilist.activity.minutesAgo")
      return `${variables?.count ?? 0} min`;
    if (key === "anilist.activity.hoursAgo")
      return `${variables?.count ?? 0} h`;
    if (key === "anilist.activity.eventAdded") return "Added";
    if (key === "anilist.activity.eventProgress") return "Progress";
    if (key === "anilist.activity.eventCompleted") return "Completed";
    return key;
  };
}

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

function makeCollection(
  overrides: Partial<AniListCollection> = {}
): AniListCollection {
  return {
    name: "Watching",
    entries: [],
    ...overrides,
  };
}

function makeDay(count: number): DayActivity {
  return { added: 0, progress: 0, completed: 0, count, items: [] };
}

describe("dayKey", () => {
  it("formats local date as zero-padded key", () => {
    expect(dayKey(new Date(2024, 0, 5))).toBe("2024-01-05");
    expect(dayKey(new Date(2024, 11, 31))).toBe("2024-12-31");
  });
});

describe("monthLabel", () => {
  it("returns short month name for locale", () => {
    expect(monthLabel(0, "en")).toBe("Jan");
    expect(monthLabel(11, "en")).toBe("Dec");
  });
});

describe("formatActivityTime", () => {
  const now = Date.now() / 1000;
  const t = makeT();
  it("returns justNow within a minute", () => {
    expect(formatActivityTime(now - 30, t, "en")).toBe(
      "anilist.activity.justNow"
    );
  });
  it("returns minutesAgo within an hour", () => {
    expect(formatActivityTime(now - 120, t, "en")).toBe("2 min");
  });
  it("returns hoursAgo within a day", () => {
    expect(formatActivityTime(now - 7200, t, "en")).toBe("2 h");
  });
  it("returns absolute date otherwise", () => {
    const result = formatActivityTime(now - 100_000, t, "en");
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });
});

describe("groupLabel", () => {
  const now = Date.now() / 1000;
  const t = makeT();
  it("returns today for the same day", () => {
    expect(groupLabel(now, t, "en")).toBe("anilist.activity.today");
  });
  it("returns yesterday for the previous day", () => {
    expect(groupLabel(now - 86_400, t, "en")).toBe(
      "anilist.activity.yesterday"
    );
  });
  it("returns absolute date for older", () => {
    const result = groupLabel(now - 3 * 86_400, t, "en");
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });
});

describe("buildActivityMap", () => {
  const t = makeT();
  it("counts added/progress/completed events per day", () => {
    const created = new Date(2024, 4, 10, 12, 0, 0).getTime() / 1000;
    const updated = new Date(2024, 4, 11, 12, 0, 0).getTime() / 1000;
    const collections: AniListCollection[] = [
      makeCollection({
        entries: [
          makeEntry({
            media: makeMedia({ id: 1, title: "A" }),
            created_at: created,
          }),
          makeEntry({
            media: makeMedia({ id: 1, title: "A" }),
            created_at: created,
            updated_at: updated,
          }),
          makeEntry({
            media: makeMedia({ id: 2, title: "B" }),
            created_at: created,
            completed_at: "2024-05-10",
          }),
        ],
      }),
    ];
    const map = buildActivityMap(collections, t);
    const day10 = map.get("2024-05-10");
    const day11 = map.get("2024-05-11");
    expect(day10?.added).toBe(3);
    expect(day10?.completed).toBe(1);
    expect(day10?.count).toBe(4);
    expect(day10?.items).toHaveLength(2);
    expect(day11?.progress).toBe(1);
  });

  it("merges multiple events of the same media into one item", () => {
    const created = new Date(2024, 4, 10, 12, 0, 0).getTime() / 1000;
    const collections: AniListCollection[] = [
      makeCollection({
        entries: [
          makeEntry({
            media: makeMedia({ id: 1, title: "A" }),
            created_at: created,
            updated_at: created + 3600,
          }),
        ],
      }),
    ];
    const map = buildActivityMap(collections, t);
    const day = map.get("2024-05-10");
    expect(day?.items).toHaveLength(1);
    expect(day?.items[0].events).toBe("Added - Progress");
  });
});

describe("buildYearGrid", () => {
  it("builds columns covering the whole year", () => {
    const activity = new Map<string, DayActivity>();
    activity.set("2024-05-10", makeDay(2));
    const { columns, totalCount } = buildYearGrid(2024, activity);
    expect(totalCount).toBe(2);
    expect(columns.length).toBeGreaterThan(0);
    const allCells = columns.flatMap((c) => c.cells);
    expect(allCells.some((cell) => cell.count === 2)).toBe(true);
    expect(
      allCells.filter((cell) => cell.date.getFullYear() === 2024).length
    ).toBeGreaterThan(0);
  });

  it("assigns level 4 to the busiest day", () => {
    const activity = new Map<string, DayActivity>();
    activity.set("2024-05-10", makeDay(4));
    const { columns } = buildYearGrid(2024, activity);
    const cells = columns.flatMap((c) => c.cells);
    const cell = cells.find((c) => c.count === 4);
    expect(cell?.level).toBe(4);
  });
});
