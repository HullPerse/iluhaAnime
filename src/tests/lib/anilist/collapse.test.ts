import { describe, expect, it } from "vitest";

import { collapseGraph } from "@/lib/anilist/collapse.utils";
import type { FranchiseNode, RelationFilter } from "@/types/anilist";

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
