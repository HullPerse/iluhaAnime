import { describe, expect, it } from "vitest";
import { timerFlush } from "d3-timer";
import {
  computeMainlineIds,
  computeNodeRelationMap,
  filterFranchiseNodesBySearch,
  filterGraph,
  groupFranchiseNodes,
  relationGroup,
  sortFranchiseNodes,
} from "@/lib/graphics/graph.utils";
import {
  ALL_LISTS_ID,
  activeListEntries,
  collectAllEntries,
  groupEntriesByList,
} from "@/lib/anilist/anilistGroup.utils";
import { anilistProxyArgs } from "@/lib/anilist/anilistProxy.utils";
import {
  buildSimNodes,
  computeGraphMetrics,
  computeNodeDimensions,
  runFranchiseSimulation,
} from "@/lib/core/sim.utils";
import {
  spotlightBoundaryMs,
  spotlightPageIndex,
  spotlightPeriodKey,
} from "@/lib/core/spotlight.utils";
import type {
  AniListCollection,
  AniListEntry,
  AniMedia,
  FranchiseGraph,
  FranchiseNode,
  FranchiseNodePosition,
  RelationFilter,
} from "@/types/anilist/anilist";

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
      status: null,
      next_airing_episode: null,
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
      private: null,
      hidden_from_status_lists: null,
      custom_lists: [],
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
      status: null,
      next_airing_episode: null,
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
      timerFlush();
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
