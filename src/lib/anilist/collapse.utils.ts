import type {
  CollapsedGraph,
  FilteredGraph,
  FranchiseEdge,
  FranchiseNode,
  RelationFilter,
} from "@/types/anilist";

import { relationGroup } from "./graph.utils";

const AGGREGATOR_ID_BASE = -1000;

function buildRelationBuckets(
  filtered: FilteredGraph,
  relationMap: Map<number, string>,
  rootId: number
): Map<RelationFilter, number[]> {
  const buckets = new Map<RelationFilter, number[]>();
  for (const node of filtered.nodeMap.values()) {
    if (node.id === rootId) continue;
    const group = relationGroup(relationMap.get(node.id) ?? "UNKNOWN");
    const bucket = buckets.get(group);
    if (bucket) bucket.push(node.id);
    else buckets.set(group, [node.id]);
  }
  return buckets;
}

function createAggregators(
  buckets: Map<RelationFilter, number[]>,
  filtered: FilteredGraph,
  maxPerGroup: number,
  expandedGroups: Set<RelationFilter>
): {
  collapsedIds: Set<number>;
  aggregators: Map<number, { group: RelationFilter; count: number }>;
  idToAggregator: Map<number, number>;
} {
  const collapsedIds = new Set<number>();
  const aggregators = new Map<number, { group: RelationFilter; count: number }>();
  const idToAggregator = new Map<number, number>();
  let aggIndex = 0;
  for (const [group, ids] of buckets) {
    if (expandedGroups.has(group)) continue;
    if (ids.length <= maxPerGroup) continue;
    const sorted = [...ids].sort((a, b) => {
      const na = filtered.nodeMap.get(a)!;
      const nb = filtered.nodeMap.get(b)!;
      return (na.year ?? 0) - (nb.year ?? 0);
    });
    const hidden = sorted.slice(maxPerGroup);
    const aggId = AGGREGATOR_ID_BASE - aggIndex;
    aggIndex += 1;
    for (const id of hidden) {
      collapsedIds.add(id);
      idToAggregator.set(id, aggId);
    }
    aggregators.set(aggId, { group, count: hidden.length });
  }
  return { collapsedIds, aggregators, idToAggregator };
}

function buildCollapsedNodeMap(
  filtered: FilteredGraph,
  collapsedIds: Set<number>,
  aggregators: Map<number, { group: RelationFilter; count: number }>
): Map<number, FranchiseNode> {
  const nodeMap = new Map<number, FranchiseNode>();
  for (const [id, node] of filtered.nodeMap) {
    if (collapsedIds.has(id)) continue;
    nodeMap.set(id, node);
  }
  for (const [aggId, info] of aggregators) {
    nodeMap.set(aggId, {
      cover_url: null,
      episodes: null,
      format: null,
      id: aggId,
      media_type: "ANIME",
      score: null,
      title: `${info.group} +${info.count}`,
      year: null,
    });
  }
  return nodeMap;
}

function rewireEdges(
  edges: FranchiseEdge[],
  idToAggregator: Map<number, number>,
  nodeMap: Map<number, FranchiseNode>
): FranchiseEdge[] {
  const out: FranchiseEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const source = idToAggregator.get(edge.source) ?? edge.source;
    const target = idToAggregator.get(edge.target) ?? edge.target;
    if (source === target) continue;
    if (!nodeMap.has(source) || !nodeMap.has(target)) continue;
    const key = `${source}:${target}:${edge.relation_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ relation_type: edge.relation_type, source, target });
  }
  return out;
}

export function collapseGraph(
  filtered: FilteredGraph,
  relationMap: Map<number, string>,
  rootId: number,
  maxPerGroup: number,
  expandedGroups: Set<RelationFilter>
): CollapsedGraph {
  const buckets = buildRelationBuckets(filtered, relationMap, rootId);
  const { collapsedIds, aggregators, idToAggregator } = createAggregators(
    buckets,
    filtered,
    maxPerGroup,
    expandedGroups
  );
  if (collapsedIds.size === 0) return { graph: filtered, aggregators };
  const nodeMap = buildCollapsedNodeMap(filtered, collapsedIds, aggregators);
  const edges = rewireEdges(filtered.edges, idToAggregator, nodeMap);
  const ids = new Set(nodeMap.keys());
  return { graph: { edges, ids, nodeMap }, aggregators };
}
