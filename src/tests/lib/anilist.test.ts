import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "2 hours ago"),
}));

import {
  buildActivityMap,
  buildYearGrid,
  dayKey,
  formatActivityTime,
  groupLabel,
  monthLabel,
  selectInitialDayKey,
} from "@/lib/anilist/activity.utils";
import {
  cameraCenteredOn,
  cameraTransform,
  clampScale,
  panCameraBy,
  screenToWorld,
  worldToScreen,
  zoomCameraAt,
} from "@/lib/anilist/camera.utils";
import { collapseGraph } from "@/lib/anilist/collapse.utils";
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
import {
  computeMainlineIds,
  computeNodeRelationMap,
  filterFranchiseNodesBySearch,
  filterGraph,
  groupFranchiseNodes,
  relationGroup,
  sortFranchiseNodes,
} from "@/lib/anilist/graph.utils";
import {
  ALL_LISTS_ID,
  activeListEntries,
  collectAllEntries,
  groupEntriesByList,
} from "@/lib/anilist/group.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import {
  buildSimNodes,
  computeGraphMetrics,
  computeNodeDimensions,
  runFranchiseSimulation,
} from "@/lib/anilist/sim.utils";
import {
  spotlightBoundaryMs,
  spotlightPageIndex,
  spotlightPeriodKey,
} from "@/lib/anilist/spotlight.utils";
import type {
  ActivityTranslate,
  AniListCollection,
  AniListEntry,
  AniListFilters,
  AniMedia,
  DayActivity,
  FranchiseGraph,
  FranchiseNode,
  FranchiseNodePosition,
  RelationFilter,
} from "@/types/anilist";

describe("anilist/activity", () => {
  function makeT(): ActivityTranslate {
    return (key) => {
      if (key === "anilist.activity.event.added") return "Added";
      if (key === "anilist.activity.event.progress") return "Progress";
      if (key === "anilist.activity.event.completed") return "Completed";
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

  function makeCollection(overrides: Partial<AniListCollection> = {}): AniListCollection {
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
    it("delegates to date-fns with milliseconds and locale", () => {
      expect(formatActivityTime(1700000000, "en")).toBe("2 hours ago");
      expect(formatDistanceToNow).toHaveBeenCalledWith(1700000000000, {
        addSuffix: true,
        locale: enUS,
      });
    });
  });

  describe("groupLabel", () => {
    const now = Date.now() / 1000;
    const t = makeT();
    it("returns today for the same day", () => {
      expect(groupLabel(now, t, "en")).toBe("anilist.activity.today");
    });
    it("returns yesterday for the previous day", () => {
      expect(groupLabel(now - 86_400, t, "en")).toBe("anilist.activity.yesterday");
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
      expect(allCells.filter((cell) => cell.date.getFullYear() === 2024).length).toBeGreaterThan(0);
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

  describe("selectInitialDayKey", () => {
    function activeMap(keys: string[]): Map<string, DayActivity> {
      const map = new Map<string, DayActivity>();
      for (const key of keys) map.set(key, makeDay(1));
      return map;
    }

    it("returns null for empty activity", () => {
      expect(selectInitialDayKey(new Map(), 2024, new Date(2024, 5, 1))).toBeNull();
    });

    it("returns the latest active day of the year", () => {
      const map = activeMap(["2024-03-01", "2024-05-10", "2024-01-20"]);
      expect(selectInitialDayKey(map, 2024, new Date(2024, 11, 31))).toBe("2024-05-10");
    });

    it("ignores other years", () => {
      const map = activeMap(["2023-12-31", "2025-01-01", "2024-02-02"]);
      expect(selectInitialDayKey(map, 2024, new Date(2024, 11, 31))).toBe("2024-02-02");
    });

    it("ignores future days in the current year", () => {
      const map = activeMap(["2024-06-10", "2024-09-30"]);
      expect(selectInitialDayKey(map, 2024, new Date(2024, 5, 15))).toBe("2024-06-10");
      expect(selectInitialDayKey(map, 2024, new Date(2024, 5, 1))).toBeNull();
    });

    it("ignores zero-count days", () => {
      const map = activeMap(["2024-04-01"]);
      map.set("2024-07-07", makeDay(0));
      expect(selectInitialDayKey(map, 2024, new Date(2024, 11, 31))).toBe("2024-04-01");
    });
  });
});

describe("anilist/camera", () => {
  describe("cameraTransform / worldToScreen / screenToWorld", () => {
    it("converts world points to screen with scale and offset", () => {
      const transform = cameraTransform({ scale: 2, x: 10, y: -5 });
      expect(worldToScreen({ x: 3, y: 4 }, transform)).toEqual({ x: 16, y: 3 });
    });

    it("round-trips world <-> screen", () => {
      const transform = cameraTransform({ scale: 1.5, x: 42, y: -17 });
      const point = { x: 100, y: 200 };
      expect(screenToWorld(worldToScreen(point, transform), transform)).toEqual(point);
    });
  });

  describe("clampScale", () => {
    it("clamps within the given bounds", () => {
      expect(clampScale(0.05, 0.1, 5)).toBe(0.1);
      expect(clampScale(2, 0.1, 5)).toBe(2);
      expect(clampScale(10, 0.1, 5)).toBe(5);
    });
  });

  describe("zoomCameraAt", () => {
    it("keeps the world point under the pointer fixed while zooming in", () => {
      const camera = { scale: 1, x: 0, y: 0 };
      const pointer = { x: 200, y: 150 };
      const next = zoomCameraAt(camera, pointer, 1.5, 0.1, 5);
      expect(next.scale).toBe(1.5);
      const worldBefore = screenToWorld(pointer, cameraTransform(camera));
      const worldAfter = screenToWorld(pointer, cameraTransform(next));
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    });

    it("keeps the world point fixed while zooming out", () => {
      const camera = { scale: 2, x: 50, y: 50 };
      const pointer = { x: 300, y: 100 };
      const next = zoomCameraAt(camera, pointer, 0.5, 0.1, 5);
      expect(next.scale).toBe(1);
      const worldBefore = screenToWorld(pointer, cameraTransform(camera));
      const worldAfter = screenToWorld(pointer, cameraTransform(next));
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    });

    it("clamps to min and max scale", () => {
      const zoomIn = zoomCameraAt({ scale: 4.9, x: 0, y: 0 }, { x: 10, y: 10 }, 2, 0.1, 5);
      expect(zoomIn.scale).toBe(5);
      const zoomOut = zoomCameraAt({ scale: 0.15, x: 0, y: 0 }, { x: 10, y: 10 }, 0.5, 0.1, 5);
      expect(zoomOut.scale).toBe(0.1);
    });

    it("returns the same camera when the scale would not change", () => {
      const camera = { scale: 5, x: 3, y: 4 };
      expect(zoomCameraAt(camera, { x: 1, y: 1 }, 2, 0.1, 5)).toBe(camera);
    });
  });

  describe("panCameraBy", () => {
    it("translates the camera by the given delta", () => {
      expect(panCameraBy({ scale: 1, x: 10, y: 20 }, 5, -3)).toEqual({ scale: 1, x: 15, y: 17 });
    });
  });

  describe("cameraCenteredOn", () => {
    it("centers the world point at the viewport center", () => {
      const camera = cameraCenteredOn({ x: 400, y: 300 }, { width: 800, height: 600 }, 1.5);
      expect(camera.scale).toBe(1.5);
      expect(camera.x).toBe(400 - 400 * 1.5);
      expect(camera.y).toBe(300 - 300 * 1.5);
      const worldCenter = screenToWorld({ x: 400, y: 300 }, cameraTransform(camera));
      expect(worldCenter.x).toBeCloseTo(400, 6);
      expect(worldCenter.y).toBeCloseTo(300, 6);
    });
  });
});

describe("anilist/collapse", () => {
  function makeNode(overrides: Partial<FranchiseNode> = {}): FranchiseNode {
    return {
      cover_url: null,
      episodes: 220,
      format: "TV",
      id: 1,
      media_type: "ANIME",
      score: 8,
      title: "Naruto",
      year: 2002,
      ...overrides,
    };
  }

  describe("collapseGraph", () => {
    it("collapses oversized groups into aggregator nodes", () => {
      const nodes = [
        makeNode({ id: 1, title: "Root", year: 2010 }),
        makeNode({ id: 2, title: "Side 1", year: 2011 }),
        makeNode({ id: 3, title: "Side 2", year: 2012 }),
        makeNode({ id: 4, title: "Side 3", year: 2013 }),
        makeNode({ id: 5, title: "Spin 1", year: 2014 }),
      ];
      const filtered = {
        edges: [
          { relation_type: "SIDE_STORY", source: 1, target: 2 },
          { relation_type: "SIDE_STORY", source: 1, target: 3 },
          { relation_type: "SIDE_STORY", source: 1, target: 4 },
          { relation_type: "SPIN_OFF", source: 1, target: 5 },
        ],
        ids: new Set([1, 2, 3, 4, 5]),
        nodeMap: new Map(nodes.map((n) => [n.id, n] as const)),
      };
      const relationMap = new Map<number, string>([
        [1, "ROOT"],
        [2, "SIDE_STORY"],
        [3, "SIDE_STORY"],
        [4, "SIDE_STORY"],
        [5, "SPIN_OFF"],
      ]);
      const { graph, aggregators } = collapseGraph(filtered, relationMap, 1, 2, new Set());
      expect(graph.nodeMap.size).toBe(5);
      const aggregatorId = [...aggregators.keys()][0];
      expect(aggregators.get(aggregatorId)?.count).toBe(1);
      expect(graph.nodeMap.has(4)).toBe(false);
      expect(graph.edges.some((e) => e.target === aggregatorId)).toBe(true);
    });

    it("keeps all nodes when an oversized group is expanded", () => {
      const nodes = [
        makeNode({ id: 1, title: "Root", year: 2010 }),
        makeNode({ id: 2, title: "Side 1", year: 2011 }),
        makeNode({ id: 3, title: "Side 2", year: 2012 }),
        makeNode({ id: 4, title: "Side 3", year: 2013 }),
      ];
      const filtered = {
        edges: [
          { relation_type: "SIDE_STORY", source: 1, target: 2 },
          { relation_type: "SIDE_STORY", source: 1, target: 3 },
          { relation_type: "SIDE_STORY", source: 1, target: 4 },
        ],
        ids: new Set([1, 2, 3, 4]),
        nodeMap: new Map(nodes.map((n) => [n.id, n] as const)),
      };
      const relationMap = new Map<number, string>([
        [1, "ROOT"],
        [2, "SIDE_STORY"],
        [3, "SIDE_STORY"],
        [4, "SIDE_STORY"],
      ]);
      const { graph } = collapseGraph(
        filtered,
        relationMap,
        1,
        2,
        new Set(["SIDE_STORY" as RelationFilter])
      );
      expect(graph.nodeMap.size).toBe(4);
    });
  });
});

describe("anilist/entries", () => {
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

    it("sorts plain keys in both directions", () => {
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
      expect(sortEntries(entries, "desc", "score").map((e) => e.media.score)).toEqual([9, 8, 7]);
      expect(sortEntries(entries, "asc", "score").map((e) => e.media.score)).toEqual([7, 8, 9]);
      expect(sortEntries(entries, "desc", "progress").map((e) => e.progress)).toEqual([10, 5, 1]);
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

    it("sorts media by key", () => {
      expect(sortAniMediaList(results, "relevance", "asc").map((m) => m.id)).toEqual([1, 2, 3]);
      expect(sortAniMediaList(results, "title", "asc").map((m) => m.title)).toEqual([
        "AoT",
        "Bleach",
        "Naruto",
      ]);
      expect(sortAniMediaList(results, "score", "desc").map((m) => m.score)).toEqual([9, 8, 7]);
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
      expect(
        entryListDate({ ...base, list_status: "CURRENT", started_at: "2023-05-02" }, "en")
      ).toBe("5/2/2023");
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
    const byStatus = (status: string, id: number) =>
      makeEntry({ media: makeMedia({ id, status }) });
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
      expect(sortEntries(entries, "desc", "status").map((e) => e.media.id)).toEqual([
        1, 5, 2, 4, 3,
      ]);
    });
  });
});

describe("anilist/graph", () => {
  function makeNode(overrides: Partial<FranchiseNode> = {}): FranchiseNode {
    return {
      cover_url: null,
      episodes: 220,
      format: "TV",
      id: 1,
      media_type: "ANIME",
      score: 8,
      title: "Naruto",
      year: 2002,
      ...overrides,
    };
  }

  describe("filterGraph", () => {
    const graph: FranchiseGraph = {
      edges: [
        { source: 1, target: 2, relation_type: "SEQUEL" },
        { source: 1, target: 3, relation_type: "SEQUEL" },
        { source: 1, target: 4, relation_type: "ADAPTATION" },
      ],
      nodes: [
        makeNode({ id: 1, title: "Naruto" }),
        makeNode({ id: 2, title: "Naruto Shippuden" }),
        makeNode({ id: 3, title: "Boruto" }),
        makeNode({ id: 4, title: "Manga", media_type: "MANGA" }),
      ],
      root_id: 1,
    };

    it("keeps edges matching selected filter groups", () => {
      const filtered = filterGraph(graph, new Set<RelationFilter>(["SEQUEL"]));
      expect(filtered.edges).toEqual([
        { relation_type: "SEQUEL", source: 1, target: 2 },
        { relation_type: "SEQUEL", source: 1, target: 3 },
      ]);
      expect(filtered.nodeMap.has(4)).toBe(false);
    });

    it("includes OTHER group relation types", () => {
      const mangaGraph: FranchiseGraph = {
        edges: [{ source: 1, target: 4, relation_type: "ADAPTATION" }],
        nodes: [makeNode({ id: 1, title: "Naruto" }), makeNode({ id: 4, title: "Manga" })],
        root_id: 1,
      };
      const filtered = filterGraph(mangaGraph, new Set<RelationFilter>(["OTHER"]));
      expect(filtered.edges).toEqual([{ relation_type: "ADAPTATION", source: 1, target: 4 }]);
    });

    it("drops non-anime nodes and their edges", () => {
      const filtered = filterGraph(graph, new Set<RelationFilter>(["OTHER"]));
      expect(filtered.nodeMap.has(4)).toBe(false);
      expect(filtered.edges).toEqual([]);
    });

    it("always keeps the root node", () => {
      const filtered = filterGraph(graph, new Set<RelationFilter>(["SEQUEL"]));
      expect(filtered.nodeMap.has(1)).toBe(true);
    });

    it("keeps every anime relation group when all filters are enabled", () => {
      const franchiseGraph: FranchiseGraph = {
        edges: [
          { source: 1, target: 2, relation_type: "SEQUEL" },
          { source: 1, target: 3, relation_type: "PREQUEL" },
          { source: 1, target: 4, relation_type: "SIDE_STORY" },
          { source: 1, target: 5, relation_type: "SPIN_OFF" },
          { source: 1, target: 6, relation_type: "ALTERNATIVE" },
        ],
        nodes: [
          makeNode({ id: 1 }),
          makeNode({ id: 2, title: "Season 2" }),
          makeNode({ id: 3, title: "Season 1" }),
          makeNode({ id: 4, title: "Side story" }),
          makeNode({ id: 5, title: "Spin-off" }),
          makeNode({ id: 6, title: "Alternative" }),
        ],
        root_id: 1,
      };
      const filtered = filterGraph(
        franchiseGraph,
        new Set<RelationFilter>(["SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF", "OTHER"])
      );
      expect(filtered.nodeMap.size).toBe(6);
      expect(filtered.edges).toHaveLength(5);
    });
  });

  describe("filterFranchiseNodesBySearch", () => {
    it("returns matching node ids case-insensitively", () => {
      const nodeMap = new Map([
        [1, makeNode({ id: 1, title: "Naruto" })],
        [2, makeNode({ id: 2, title: "One Piece" })],
        [3, makeNode({ id: 3, title: "Naruto Shippuden" })],
      ]);
      const ids = filterFranchiseNodesBySearch(nodeMap, "naru");
      expect(ids).toEqual(new Set([1, 3]));
    });

    it("returns null for an empty query", () => {
      const nodeMap = new Map([[1, makeNode({ id: 1, title: "Naruto" })]]);
      expect(filterFranchiseNodesBySearch(nodeMap, "  ")).toBeNull();
    });
  });

  describe("computeNodeRelationMap", () => {
    it("walks the graph from the root assigning relation types", () => {
      const graph: FranchiseGraph = {
        edges: [
          { source: 1, target: 2, relation_type: "SEQUEL" },
          { source: 2, target: 3, relation_type: "PREQUEL" },
        ],
        nodes: [makeNode({ id: 1 }), makeNode({ id: 2 }), makeNode({ id: 3 })],
        root_id: 1,
      };
      const nodeMap = new Map([
        [1, makeNode({ id: 1 })],
        [2, makeNode({ id: 2 })],
        [3, makeNode({ id: 3 })],
      ]);
      const map = computeNodeRelationMap(graph, nodeMap);
      expect(map.get(1)).toBe("ROOT");
      expect(map.get(2)).toBe("SEQUEL");
      expect(map.get(3)).toBe("PREQUEL");
    });
  });

  describe("sortFranchiseNodes", () => {
    it("sorts by year then title", () => {
      const nodes = [
        makeNode({ id: 1, title: "Zeta", year: 2005 }),
        makeNode({ id: 2, title: "Alpha", year: 2002 }),
        makeNode({ id: 3, title: "Beta", year: 2005 }),
      ];
      expect(sortFranchiseNodes(nodes).map((n) => n.title)).toEqual(["Alpha", "Beta", "Zeta"]);
    });

    it("treats missing years as zero", () => {
      const nodes = [
        makeNode({ id: 1, title: "Unknown", year: null }),
        makeNode({ id: 2, title: "Old", year: 1999 }),
      ];
      expect(sortFranchiseNodes(nodes).map((n) => n.title)).toEqual(["Unknown", "Old"]);
    });
  });

  describe("relationGroup", () => {
    it("maps each relation type to its filter group", () => {
      expect(relationGroup("SEQUEL")).toBe("SEQUEL");
      expect(relationGroup("PREQUEL")).toBe("PREQUEL");
      expect(relationGroup("SIDE_STORY")).toBe("SIDE_STORY");
      expect(relationGroup("SPIN_OFF")).toBe("SPIN_OFF");
      expect(relationGroup("ADAPTATION")).toBe("OTHER");
      expect(relationGroup("CHARACTER")).toBe("OTHER");
      expect(relationGroup("UNKNOWN")).toBe("OTHER");
    });
  });

  describe("groupFranchiseNodes", () => {
    it("buckets nodes by relation group and sorts by year", () => {
      const nodes = [
        makeNode({ id: 3, title: "Side B", year: 2013 }),
        makeNode({ id: 2, title: "Sequel", year: 2007 }),
        makeNode({ id: 4, title: "Side A", year: 2010 }),
      ];
      const relationMap = new Map<number, string>([
        [2, "SEQUEL"],
        [3, "SIDE_STORY"],
        [4, "SIDE_STORY"],
      ]);
      const groups = groupFranchiseNodes(nodes, relationMap);
      expect(groups.map((g) => g.group)).toEqual(
        ["SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF", "OTHER"].filter((g) =>
          ["SEQUEL", "SIDE_STORY"].includes(g)
        )
      );
      const sequel = groups.find((g) => g.group === "SEQUEL")!;
      expect(sequel.items.map((n) => n.id)).toEqual([2]);
      const side = groups.find((g) => g.group === "SIDE_STORY")!;
      expect(side.items.map((n) => n.id)).toEqual([4, 3]);
    });
  });

  describe("computeMainlineIds", () => {
    it("walks SEQUEL/PREQUEL edges from the root", () => {
      const graph: FranchiseGraph = {
        edges: [
          { relation_type: "SEQUEL", source: 1, target: 2 },
          { relation_type: "SEQUEL", source: 2, target: 3 },
          { relation_type: "SIDE_STORY", source: 1, target: 4 },
        ],
        nodes: [makeNode({ id: 1 }), makeNode({ id: 2 }), makeNode({ id: 3 }), makeNode({ id: 4 })],
        root_id: 1,
      };
      const nodeMap = new Map(graph.nodes.map((n) => [n.id, n] as const));
      const ids = computeMainlineIds(graph, nodeMap, 1);
      expect(ids).toEqual(new Set([1, 2, 3]));
    });
  });
});

describe("anilist/group", () => {
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
      notes: null,
      repeat: null,
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
      expect(groups.map((g) => g.entries.map((e) => e.media.id))).toEqual([[1, 2], [3]]);
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
});

describe("anilist/proxy", () => {
  describe("anilistProxyArgs", () => {
    it("returns no keys without a proxy", () => {
      expect(anilistProxyArgs(null)).toEqual({});
    });

    it("returns no keys for a blank proxy", () => {
      expect(anilistProxyArgs("   ")).toEqual({});
    });

    it("returns both casings trimmed for a set proxy", () => {
      expect(anilistProxyArgs("  http://127.0.0.1:7890 ")).toEqual({
        proxyUrl: "http://127.0.0.1:7890",
        proxy_url: "http://127.0.0.1:7890",
      });
    });
  });
});

describe("anilist/sim", () => {
  function makeNode(overrides: Partial<FranchiseNode> = {}): FranchiseNode {
    return {
      cover_url: null,
      episodes: 220,
      format: "TV",
      id: 1,
      media_type: "ANIME",
      score: 8,
      title: "Naruto",
      year: 2002,
      ...overrides,
    };
  }

  describe("computeNodeDimensions", () => {
    it("scales down for large graphs", () => {
      expect(computeNodeDimensions(10).scale).toBe(1);
      expect(computeNodeDimensions(20).scale).toBe(0.85);
      expect(computeNodeDimensions(30).scale).toBe(0.75);
    });

    it("scales dimensions for large graphs", () => {
      const dims = computeNodeDimensions(30);
      expect(dims.imgH).toBe(60);
      expect(dims.w).toBe(53);
      expect(dims.h).toBe(76);
    });
  });

  describe("computeGraphMetrics", () => {
    it("clamps the total height within bounds", () => {
      expect(computeGraphMetrics(2).totalH).toBe(300);
      expect(computeGraphMetrics(5).totalH).toBe(400);
      expect(computeGraphMetrics(50).totalH).toBe(1400);
    });

    it("clamps the display height", () => {
      expect(computeGraphMetrics(2).displayH).toBe(300);
      expect(computeGraphMetrics(5).displayH).toBe(400);
      expect(computeGraphMetrics(50).displayH).toBe(600);
    });
  });

  describe("buildSimNodes", () => {
    it("centers the root node and lays out related nodes", () => {
      const nodeMap = new Map([
        [1, makeNode({ id: 1, year: 2002 })],
        [2, makeNode({ id: 2, title: "Naruto Shippuden", year: 2007 })],
      ]);
      const filtered = {
        edges: [{ relation_type: "SEQUEL", source: 1, target: 2 }],
        ids: new Set([1, 2]),
        nodeMap,
      };
      const relationMap = new Map<number, string>([
        [1, "ROOT"],
        [2, "SEQUEL"],
      ]);
      const { simNodes } = buildSimNodes(filtered, 1000, 1, 600, { h: 95, w: 70 }, relationMap);
      expect(simNodes).toHaveLength(2);
      const root = simNodes.find((n) => n.id === 1)!;
      expect(root.clusterX).toBe(500);
      const sequel = simNodes.find((n) => n.id === 2)!;
      expect(sequel.clusterX).toBe(750);
    });

    it("centers mainline nodes on the timeline", () => {
      const nodeMap = new Map([
        [1, makeNode({ id: 1, year: 2002 })],
        [2, makeNode({ id: 2, title: "Naruto Shippuden", year: 2007 })],
      ]);
      const filtered = {
        edges: [{ relation_type: "SEQUEL", source: 1, target: 2 }],
        ids: new Set([1, 2]),
        nodeMap,
      };
      const relationMap = new Map<number, string>([
        [1, "ROOT"],
        [2, "SEQUEL"],
      ]);
      const { simNodes } = buildSimNodes(
        filtered,
        1000,
        1,
        600,
        { h: 95, w: 70 },
        relationMap,
        new Set([2])
      );
      const sequel = simNodes.find((n) => n.id === 2)!;
      expect(sequel.clusterX).toBe(500);
    });
  });

  describe("runFranchiseSimulation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("forwards throttled ticks and final positions on end", () => {
      const seen: Map<number, FranchiseNodePosition>[] = [];
      const sim = runFranchiseSimulation(
        [
          { id: 1, clusterX: 100, x: 100, y: 100, vx: 0, vy: 0 },
          { id: 2, clusterX: 400, x: 400, y: 100, vx: 0, vy: 0 },
        ] as never,
        800,
        600,
        { w: 70, h: 95 },
        (pos) => {
          seen.push(pos);
        }
      );
      vi.advanceTimersByTime(10000);
      sim.stop();
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.length).toBeLessThan(200);
      const last = seen.at(-1)!;
      expect(last.has(1)).toBe(true);
      expect(last.has(2)).toBe(true);
    });
  });
});

describe("anilist/spotlight", () => {
  describe("spotlightPeriodKey", () => {
    it("keys days by local calendar date", () => {
      expect(spotlightPeriodKey("day", new Date(2026, 8, 10, 23, 59))).toBe("2026-09-10");
      expect(spotlightPeriodKey("day", new Date(2026, 8, 11, 0, 0))).toBe("2026-09-11");
    });

    it("keys months by year and month", () => {
      expect(spotlightPeriodKey("month", new Date(2026, 0, 31))).toBe("2026-01");
      expect(spotlightPeriodKey("month", new Date(2026, 1, 1))).toBe("2026-02");
    });

    it("keeps the ISO week across the Sunday boundary", () => {
      const sunday = spotlightPeriodKey("week", new Date(2026, 8, 13));
      const monday = spotlightPeriodKey("week", new Date(2026, 8, 14));
      expect(sunday).not.toBe(monday);
      expect(monday).toMatch(/^2026-W\d{2}$/);
    });
  });

  describe("spotlightBoundaryMs", () => {
    it("points days at the next local midnight", () => {
      const now = new Date(2026, 8, 10, 15, 30).getTime();
      expect(new Date(spotlightBoundaryMs("day", now))).toEqual(new Date(2026, 8, 11, 0, 0));
    });

    it("points weeks at Monday midnight", () => {
      const thursday = new Date(2026, 8, 10, 15, 30).getTime();
      expect(new Date(spotlightBoundaryMs("week", thursday))).toEqual(new Date(2026, 8, 14, 0, 0));
    });

    it("points months at the first day midnight", () => {
      const now = new Date(2026, 0, 31, 12, 0).getTime();
      expect(new Date(spotlightBoundaryMs("month", now))).toEqual(new Date(2026, 1, 1, 0, 0));
    });
  });

  describe("spotlightPageIndex", () => {
    it("is deterministic per kind and period", () => {
      expect(spotlightPageIndex("day", "2026-09-10", 5000, 50)).toEqual(
        spotlightPageIndex("day", "2026-09-10", 5000, 50)
      );
      expect(spotlightPageIndex("day", "2026-09-10", 5000, 50)).not.toEqual(
        spotlightPageIndex("day", "2026-09-11", 5000, 50)
      );
    });
    it("stays within the page and index bounds", () => {
      const { page, index } = spotlightPageIndex("month", "2026-09", 5000, 50);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(100);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(50);
    });

    it("survives an empty pool", () => {
      const { page } = spotlightPageIndex("week", "2026-W37", 0, 50);
      expect(page).toBe(1);
    });
    it("degrades gracefully on non-positive perPage and negative totals", () => {
      const zero = spotlightPageIndex("day", "2026-09-10", 5000, 0);
      expect(zero.index).toBe(0);
      expect(zero.page).toBeGreaterThanOrEqual(1);
      const negative = spotlightPageIndex("day", "2026-09-10", 5000, -5);
      expect(negative.index).toBe(0);
      expect(spotlightPageIndex("day", "2026-09-10", -100, 50).page).toBe(1);
    });
    it("seeds kinds independently for the same period key", () => {
      expect(spotlightPageIndex("day", "2026-09", 5000, 50)).not.toEqual(
        spotlightPageIndex("week", "2026-09", 5000, 50)
      );
    });

    it("varies the index across periods", () => {
      const indexes = Array.from({ length: 12 }, (_, m) =>
        spotlightPageIndex("month", `2026-${String(m + 1).padStart(2, "0")}`, 5000, 50)
      ).map(({ index }) => index);
      expect(new Set(indexes).size).toBeGreaterThan(1);
    });
  });
});
