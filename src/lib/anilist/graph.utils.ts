import { FILTER_GROUPS, FORMAT_SHORT, RELATION_FILTERS } from "@/config/anilist/graph.config";
import type { FilteredGraph, FranchiseGraph, FranchiseNode, RelationFilter } from "@/types/anilist";

export function filterGraph(graph: FranchiseGraph, filters: Set<RelationFilter>): FilteredGraph {
  const filteredEdges = graph.edges.filter((e) =>
    [...filters].some((g) => FILTER_GROUPS[g].includes(e.relation_type))
  );
  const ids = new Set<number>([graph.root_id]);
  filteredEdges.forEach((e) => {
    ids.add(e.source);
    ids.add(e.target);
  });
  const nodeMap = new Map(
    graph.nodes
      .filter(
        (n) =>
          ids.has(n.id) &&
          (n.id === graph.root_id || n.media_type === "ANIME" || n.media_type == null)
      )
      .map((n) => [n.id, n])
  );
  const edges = filteredEdges.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target));
  return { edges, ids, nodeMap };
}

export function relationGroup(relType: string): RelationFilter {
  for (const group of RELATION_FILTERS) {
    if (FILTER_GROUPS[group].includes(relType)) return group;
  }
  return "OTHER";
}

export function groupFranchiseNodes(
  nodes: FranchiseNode[],
  relationMap: Map<number, string>
): { group: RelationFilter; items: FranchiseNode[] }[] {
  const buckets = new Map<RelationFilter, FranchiseNode[]>();
  for (const node of nodes) {
    const rel = relationMap.get(node.id) ?? "UNKNOWN";
    const group = relationGroup(rel);
    const bucket = buckets.get(group);
    if (bucket) bucket.push(node);
    else buckets.set(group, [node]);
  }
  return RELATION_FILTERS.map((group) => ({
    group,
    items: sortFranchiseNodes(buckets.get(group) ?? []),
  })).filter((entry) => entry.items.length > 0);
}

export function sortFranchiseNodes(nodes: FranchiseNode[]): FranchiseNode[] {
  return [...nodes].sort((a, b) => {
    if (a.year !== b.year) return (a.year ?? 0) - (b.year ?? 0);
    return a.title.localeCompare(b.title);
  });
}

export function computeMainlineIds(
  graph: FranchiseGraph,
  nodeMap: Map<number, FranchiseNode>,
  rootId: number
): Set<number> {
  const mainline = new Set<number>([rootId]);
  const adj = new Map<number, number[]>();
  for (const edge of graph.edges) {
    if (edge.relation_type !== "SEQUEL" && edge.relation_type !== "PREQUEL") continue;
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    if (!adj.has(edge.target)) adj.set(edge.target, []);
    adj.get(edge.source)!.push(edge.target);
    adj.get(edge.target)!.push(edge.source);
  }
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!mainline.has(next)) {
        mainline.add(next);
        queue.push(next);
      }
    }
  }
  return mainline;
}

export function computeNodeRelationMap(
  graph: FranchiseGraph,
  nodeMap: Map<number, FranchiseNode>
): Map<number, string> {
  const relation = new Map<number, string>([[graph.root_id, "ROOT"]]);
  const adj = new Map<number, { node: number; type: string }[]>();
  for (const e of graph.edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ node: e.target, type: e.relation_type });
    adj.get(e.target)!.push({ node: e.source, type: e.relation_type });
  }

  const queue = [graph.root_id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const { node, type } of adj.get(cur) ?? []) {
      if (!relation.has(node)) {
        relation.set(node, type);
        queue.push(node);
      }
    }
  }
  return relation;
}

export function filterFranchiseNodesBySearch(
  nodeMap: Map<number, FranchiseNode>,
  query: string
): Set<number> | null {
  const lower = query.toLowerCase().trim();
  if (!lower) return null;
  const ids = new Set<number>();
  for (const node of nodeMap.values()) {
    if (node.title.toLowerCase().includes(lower)) {
      ids.add(node.id);
    }
  }
  return ids;
}

export function formatShort(format: string): string {
  return FORMAT_SHORT[format] ?? format.slice(0, 3).toUpperCase();
}
