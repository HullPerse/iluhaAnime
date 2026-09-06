import { describe, expect, it } from "vitest";

import {
  computeMainlineIds,
  computeNodeRelationMap,
  filterFranchiseNodesBySearch,
  filterGraph,
  groupFranchiseNodes,
  relationGroup,
  sortFranchiseNodes,
} from "@/lib/anilist/graph.utils";
import type { FranchiseGraph, FranchiseNode, RelationFilter } from "@/types/anilist";

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
