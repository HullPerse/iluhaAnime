import { forceSimulation, forceX, forceCollide } from "d3-force";
import type { Simulation } from "d3-force";

import {
  FILTER_GROUPS,
  IMG_H,
  NODE_H,
  NODE_W,
  RELATION_FILTERS,
  RELATION_X,
} from "@/config/anilist.config";
import type { HexType } from "@/types";
import type {
  AniListCollection,
  AniListEntry,
  AniListSort,
  AniMedia,
  FilteredGraph,
  FranchiseEdge,
  FranchiseGraph,
  FranchiseNode,
  FranchiseNodePosition,
  RelationFilter,
  AniListFilters,
  SimNode,
} from "@/types/anilist";

export function filterEntries(
  entries: AniListEntry[],
  searchTerms: string,
  global: boolean
) {
  return entries.filter((e) => {
    if (!searchTerms.trim() || global) return true;

    const query = searchTerms.toLowerCase();

    return (
      e.media.title.toLowerCase().includes(query) ||
      e.media.titles.some((t) => t.toLowerCase().includes(query))
    );
  });
}

export function sortEntries(
  filtered: AniListEntry[],
  direction: AniListSort["dir"],
  method: AniListSort["key"]
): AniListEntry[] {
  const copy = [...filtered];

  const sortMap = {
    progress: () =>
      copy.sort((a, b) => {
        const d = (b.progress ?? -1) - (a.progress ?? -1);
        return direction === "desc" ? d : -d;
      }),
    score: () =>
      copy.sort((a, b) => {
        const d = (b.media.score ?? -1) - (a.media.score ?? -1);
        return direction === "desc" ? d : -d;
      }),
    title: () =>
      copy.sort((a, b) => {
        const c = a.media.title.localeCompare(b.media.title);
        return direction === "asc" ? c : -c;
      }),
  } as Record<AniListSort["key"], () => AniListEntry[]>;

  return sortMap[method]();
}

// Returns an i18n key; UI renders it through translate().
export function getSortingLabel(sort: string): string {
  const labelMap: Record<string, string> = {
    popularity: "anilist.sort.popularity",
    progress: "anilist.sort.progress",
    relevance: "anilist.sort.relevance",
    score: "anilist.sort.score",
    title: "anilist.sort.title",
    year: "anilist.sort.year",
  };

  return labelMap[sort] ?? sort;
}

export function getStatusColor(status: AniListEntry["list_status"]): HexType {
  const statusMap: Record<AniListEntry["list_status"], HexType> = {
    COMPLETED: "#4caf50",
    CURRENT: "#e6b800",
    DROPPED: "#f44336",
    PAUSED: "#ff9800",
    PLANNING: "#2196f3",
    REPEATING: "#9c27b0",
  };

  return statusMap[status] ?? "#888";
}

export function filterGraph(
  graph: FranchiseGraph,
  filters: Set<RelationFilter>
): FilteredGraph {
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
          (n.id === graph.root_id ||
            n.media_type === "ANIME" ||
            n.media_type == null)
      )
      .map((n) => [n.id, n])
  );
  const edges = filteredEdges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target)
  );
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

export function computeMainlineIds(
  graph: FranchiseGraph,
  nodeMap: Map<number, FranchiseNode>,
  rootId: number
): Set<number> {
  const mainline = new Set<number>([rootId]);
  const adj = new Map<number, number[]>();
  for (const edge of graph.edges) {
    if (edge.relation_type !== "SEQUEL" && edge.relation_type !== "PREQUEL")
      continue;
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

function getClusterX(
  nodeId: number,
  rootId: number,
  containerW: number,
  relationMap: Map<number, string>,
  jitter: number
): number {
  if (nodeId === rootId) return containerW / 2;

  const rel = relationMap.get(nodeId);
  if (!rel) return containerW / 2;

  const ratio = RELATION_X[rel] ?? 0.5;
  return containerW * ratio + jitter;
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

export function sortFranchiseNodes(nodes: FranchiseNode[]): FranchiseNode[] {
  return [...nodes].sort((a, b) => {
    if (a.year !== b.year) return (a.year ?? 0) - (b.year ?? 0);
    return a.title.localeCompare(b.title);
  });
}

export function buildEntryLookup(lists: AniListCollection[]) {
  const map = new Map<
    number,
    { progress: number | null; score: number | null; list_status: string }
  >();
  for (const list of lists) {
    for (const e of list.entries) {
      map.set(e.media.id, {
        list_status: e.list_status,
        progress: e.progress,
        score: e.score,
      });
    }
  }
  return map;
}

export function searchFiltersToParams(
  filters: AniListFilters,
  query: string | null,
  perPage: number,
  maxPages: number
) {
  return {
    adult: filters.adult || null,
    country: filters.country || null,
    episodesFrom:
      filters.episodes[0] > 0 || filters.episodes[1] > 0
        ? filters.episodes[0]
        : null,
    episodesTo:
      filters.episodes[0] > 0 || filters.episodes[1] > 0
        ? filters.episodes[1]
        : null,
    format: filters.format || null,
    genres: filters.genres.length > 0 ? filters.genres : null,
    maxPages,
    perPage,
    query,
    scoreFrom:
      filters.score[0] > 0 || filters.score[1] > 0 ? filters.score[0] : null,
    scoreTo:
      filters.score[0] > 0 || filters.score[1] > 0 ? filters.score[1] : null,
    season: filters.season || null,
    seasonYear: filters.seasonYear,
    sort: filters.sort ? [filters.sort] : null,
    source: filters.source || null,
    status: filters.status || null,
    tags: filters.tags.length > 0 ? filters.tags : null,
    yearFrom: filters.year[0] > 0 ? filters.year[0] : null,
    yearTo: filters.year[1] > 0 ? filters.year[1] : null,
  };
}

export function sortAniMediaList(
  results: AniMedia[],
  key: string,
  dir: "asc" | "desc"
): AniMedia[] {
  if (key === "relevance") return results;
  return [...results].sort((a, b) => {
    let cmp = 0;
    if (key === "title") cmp = a.title.localeCompare(b.title);
    else if (key === "score") cmp = (a.score ?? 0) - (b.score ?? 0);
    else if (key === "year") cmp = (a.season_year ?? 0) - (b.season_year ?? 0);
    return dir === "asc" ? cmp : -cmp;
  });
}

export function computeNodeDimensions(nodeCount: number) {
  const scale = nodeCount > 25 ? 0.75 : nodeCount > 15 ? 0.85 : 1;
  const imgH = Math.round(IMG_H * scale);
  const barH = Math.max(16, Math.round((NODE_H - IMG_H) * scale));
  return {
    h: imgH + barH,
    imgH,
    scale,
    w: Math.round(NODE_W * scale),
  };
}

export function computeGraphMetrics(nodeCount: number) {
  const totalH = Math.max(300, Math.min(1400, nodeCount * 80));
  const displayH = Math.max(300, Math.min(totalH, 600));
  return { displayH, totalH };
}

function clampPosition(
  x: number,
  y: number,
  bounds: { w: number; h: number; nodeW: number; nodeH: number }
): FranchiseNodePosition {
  return {
    x: Math.max(0, Math.min(bounds.w - bounds.nodeW, x)),
    y: Math.max(0, Math.min(bounds.h - bounds.nodeH, y)),
  };
}

function getNodeYearY(
  node: FranchiseNode,
  index: number,
  count: number,
  minYear: number,
  yearRange: number,
  totalH: number,
  nodeH: number
): number {
  if (node.year != null && !Number.isNaN(minYear)) {
    return 20 + ((node.year - minYear) / yearRange) * (totalH - nodeH - 40);
  }
  return 20 + (index / count) * (totalH - nodeH - 40);
}

function getNodeJitter(
  node: FranchiseNode,
  rootId: number,
  mainlineIds: Set<number>,
  relationMap: Map<number, string>,
  groupCount: Map<string, number>,
  groupIndex: Map<string, number>,
  nodeW: number
): number {
  if (node.id === rootId || mainlineIds.has(node.id)) return 0;
  const relation = relationMap.get(node.id) ?? "UNKNOWN";
  const count = groupCount.get(relation) ?? 1;
  const index = groupIndex.get(relation) ?? 0;
  groupIndex.set(relation, index + 1);
  return count > 1 ? -(count - 1) * nodeW * 0.7 + index * nodeW * 1.4 : 0;
}

export function buildSimNodes(
  filtered: FilteredGraph,
  containerW: number,
  rootId: number,
  totalH: number,
  dims: { w: number; h: number },
  relationMap: Map<number, string>,
  mainlineIds: Set<number> = new Set<number>()
) {
  const nodes: SimNode[] = [];
  const initPos = new Map<number, FranchiseNodePosition>();
  const values = [...filtered.nodeMap.values()];
  const years = values.map((n) => n.year).filter((y): y is number => y != null);
  const minYear = years.length > 0 ? Math.min(...years) : Number.NaN;
  const maxYear = years.length > 0 ? Math.max(...years) : Number.NaN;
  const yearRange = maxYear - minYear || 1;
  const groupCount = new Map<string, number>();
  const groupIndex = new Map<string, number>();
  for (const node of values) {
    if (node.id === rootId || mainlineIds.has(node.id)) continue;
    const relation = relationMap.get(node.id) ?? "UNKNOWN";
    groupCount.set(relation, (groupCount.get(relation) ?? 0) + 1);
  }
  for (const [index, node] of values.entries()) {
    const y = getNodeYearY(node, index, values.length, minYear, yearRange, totalH, dims.h);
    const jitter = getNodeJitter(node, rootId, mainlineIds, relationMap, groupCount, groupIndex, dims.w);
    const clusterX = mainlineIds.has(node.id) ? containerW / 2 : getClusterX(node.id, rootId, containerW, relationMap, jitter);
    nodes.push({ clusterX, fy: y, id: node.id, vx: 0, vy: 0, x: clusterX, y });
    initPos.set(node.id, clampPosition(clusterX - dims.w / 2, y, {
      h: totalH, nodeH: dims.h, nodeW: dims.w, w: containerW,
    }));
  }
  return { initialPositions: initPos, simNodes: nodes };
}

export function runFranchiseSimulation(
  simNodes: SimNode[],
  containerW: number,
  totalH: number,
  dims: { w: number; h: number },
  onTick: (positions: Map<number, FranchiseNodePosition>) => void
): Simulation<SimNode, undefined> {
  const sim = forceSimulation(simNodes)
    .force("x", forceX<SimNode>((d) => d.clusterX).strength(0.06))
    .force("collide", forceCollide(dims.w))
    .alphaDecay(0.025)
    .on("tick", () => {
      const pos = new Map<number, FranchiseNodePosition>();
      for (const n of sim.nodes()) {
        pos.set(
          n.id,
          clampPosition(n.x - dims.w / 2, n.y - dims.h / 2, {
            h: totalH,
            nodeH: dims.h,
            nodeW: dims.w,
            w: containerW,
          })
        );
      }
      onTick(pos);
    });

  return sim;
}

export interface CollapsedGraph {
  graph: FilteredGraph;
  aggregators: Map<number, { group: RelationFilter; count: number }>;
}

const AGGREGATOR_ID_BASE = -1000;

export function collapseGraph(
  filtered: FilteredGraph,
  relationMap: Map<number, string>,
  rootId: number,
  maxPerGroup: number,
  expandedGroups: Set<RelationFilter>
): CollapsedGraph {
  const buckets = new Map<RelationFilter, number[]>();
  for (const node of filtered.nodeMap.values()) {
    if (node.id === rootId) continue;
    const group = relationGroup(relationMap.get(node.id) ?? "UNKNOWN");
    const bucket = buckets.get(group);
    if (bucket) bucket.push(node.id);
    else buckets.set(group, [node.id]);
  }

  const collapsedIds = new Set<number>();
  const aggregators = new Map<
    number,
    { group: RelationFilter; count: number }
  >();
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

  if (collapsedIds.size === 0) {
    return { graph: filtered, aggregators };
  }

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

  const edges: FranchiseEdge[] = [];
  const seenEdges = new Set<string>();
  for (const edge of filtered.edges) {
    const source = idToAggregator.get(edge.source) ?? edge.source;
    const target = idToAggregator.get(edge.target) ?? edge.target;
    if (source === target) continue;
    if (!nodeMap.has(source) || !nodeMap.has(target)) continue;
    const key = `${source}:${target}:${edge.relation_type}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ relation_type: edge.relation_type, source, target });
  }

  const ids = new Set(nodeMap.keys());
  const graph: FilteredGraph = { edges, ids, nodeMap };
  return { graph, aggregators };
}
