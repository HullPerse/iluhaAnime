import { describe, expect, it } from "vitest";

import {
  buildEntryLookup,
  buildSimNodes,
  collapseGraph,
  computeGraphMetrics,
  computeMainlineIds,
  computeNodeDimensions,
  computeNodeRelationMap,
  filterEntries,
  filterFranchiseNodesBySearch,
  filterGraph,
  getSortingLabel,
  getStatusColor,
  groupFranchiseNodes,
  relationGroup,
  searchFiltersToParams,
  sortAniMediaList,
  sortEntries,
  sortFranchiseNodes,
} from "@/lib/anilist.utils";
import type {
  AniListCollection,
  AniListEntry,
  AniMedia,
  FranchiseGraph,
  FranchiseNode,
  RelationFilter,
  AniListFilters,
} from "@/types/anilist";

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
    expect(
      sortEntries(entries, "asc", "title").map((e) => e.media.title)
    ).toEqual(["AoT", "Bleach", "Naruto"]);
    expect(
      sortEntries(entries, "desc", "title").map((e) => e.media.title)
    ).toEqual(["Naruto", "Bleach", "AoT"]);
  });

  it("sorts by score descending and ascending", () => {
    expect(
      sortEntries(entries, "desc", "score").map((e) => e.media.score)
    ).toEqual([9, 8, 7]);
    expect(
      sortEntries(entries, "asc", "score").map((e) => e.media.score)
    ).toEqual([7, 8, 9]);
  });

  it("sorts by progress descending", () => {
    expect(
      sortEntries(entries, "desc", "progress").map((e) => e.progress)
    ).toEqual([10, 5, 1]);
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
      nodes: [
        makeNode({ id: 1, title: "Naruto" }),
        makeNode({ id: 4, title: "Manga" }),
      ],
      root_id: 1,
    };
    const filtered = filterGraph(
      mangaGraph,
      new Set<RelationFilter>(["OTHER"])
    );
    expect(filtered.edges).toEqual([
      { relation_type: "ADAPTATION", source: 1, target: 4 },
    ]);
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
      new Set<RelationFilter>([
        "SEQUEL",
        "PREQUEL",
        "SIDE_STORY",
        "SPIN_OFF",
        "OTHER",
      ])
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
    expect(sortFranchiseNodes(nodes).map((n) => n.title)).toEqual([
      "Alpha",
      "Beta",
      "Zeta",
    ]);
  });

  it("treats missing years as zero", () => {
    const nodes = [
      makeNode({ id: 1, title: "Unknown", year: null }),
      makeNode({ id: 2, title: "Old", year: 1999 }),
    ];
    expect(sortFranchiseNodes(nodes).map((n) => n.title)).toEqual([
      "Unknown",
      "Old",
    ]);
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
    expect(
      sortAniMediaList(results, "relevance", "asc").map((m) => m.id)
    ).toEqual([1, 2, 3]);
  });

  it("sorts by title", () => {
    expect(
      sortAniMediaList(results, "title", "asc").map((m) => m.title)
    ).toEqual(["AoT", "Bleach", "Naruto"]);
  });

  it("sorts by score descending by default", () => {
    expect(
      sortAniMediaList(results, "score", "desc").map((m) => m.score)
    ).toEqual([9, 8, 7]);
  });

  it("sorts by year ascending", () => {
    expect(
      sortAniMediaList(results, "year", "asc").map((m) => m.season_year)
    ).toEqual([2002, 2004, 2013]);
  });
});

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
    const { simNodes } = buildSimNodes(
      filtered,
      1000,
      1,
      600,
      { h: 95, w: 70 },
      relationMap
    );
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
    expect(groups.map((g) => g.group)).toEqual([
      "SEQUEL",
      "PREQUEL",
      "SIDE_STORY",
      "SPIN_OFF",
      "OTHER",
    ].filter((g) => ["SEQUEL", "SIDE_STORY"].includes(g)));
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
      nodes: [
        makeNode({ id: 1 }),
        makeNode({ id: 2 }),
        makeNode({ id: 3 }),
        makeNode({ id: 4 }),
      ],
      root_id: 1,
    };
    const nodeMap = new Map(
      graph.nodes.map((n) => [n.id, n] as const)
    );
    const ids = computeMainlineIds(graph, nodeMap, 1);
    expect(ids).toEqual(new Set([1, 2, 3]));
  });
});

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
    const { graph, aggregators } = collapseGraph(
      filtered,
      relationMap,
      1,
      2,
      new Set()
    );
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
