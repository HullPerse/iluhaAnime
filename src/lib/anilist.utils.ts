import {
  FILTER_GROUPS,
  IMG_H,
  NODE_H,
  NODE_W,
  RELATION_X,
} from "@/config/anilist.config";
import { HexType } from "@/types";
import type {
  AniListCollection,
  AniListEntry,
  AniListSort,
  AniMedia,
  FranchiseGraph,
  FranchiseNode,
  FranchiseNodePosition,
  RelationFilter,
  SearchFilters,
  SimNode,
} from "@/types/anilist";
import { forceSimulation, forceX, forceCollide } from "d3-force";
import type { Simulation } from "d3-force";

export function filterEntries(
  entries: AniListEntry[],
  searchTerms: string,
  global: boolean,
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
  method: AniListSort["key"],
): AniListEntry[] {
  const copy = [...filtered];

  const sortMap = {
    title: () =>
      copy.sort((a, b) => {
        const c = a.media.title.localeCompare(b.media.title);
        return direction === "asc" ? c : -c;
      }),
    score: () =>
      copy.sort((a, b) => {
        const d = (b.media.score ?? -1) - (a.media.score ?? -1);
        return direction === "desc" ? d : -d;
      }),
    progress: () =>
      copy.sort((a, b) => {
        const d = (b.progress ?? -1) - (a.progress ?? -1);
        return direction === "desc" ? d : -d;
      }),
  } as Record<AniListSort["key"], () => AniListEntry[]>;

  return sortMap[method]();
}

export function getSortingLabel(
  sort: string,
  direction: "asc" | "desc",
): string {
  const labelMap: Record<string, string> = {
    title: "Название",
    score: "Рейтинг",
    progress: "Прогресс",
    relevance: "Релевантность",
    popularity: "Популярность",
    year: "Год",
  };

  return `${labelMap[sort] ?? sort} ${direction === "asc" ? "↑" : "↓"}`;
}

export function getStatusColor(status: AniListEntry["list_status"]): HexType {
  const statusMap: Record<AniListEntry["list_status"], HexType> = {
    CURRENT: "#e6b800",
    COMPLETED: "#4caf50",
    DROPPED: "#f44336",
    PLANNING: "#2196f3",
    PAUSED: "#ff9800",
    REPEATING: "#9c27b0",
  };

  return statusMap[status] ?? "#888";
}

export interface FilteredGraph {
  edges: { source: number; target: number; relation_type: string }[];
  ids: Set<number>;
  nodeMap: Map<number, FranchiseNode>;
}

export function filterGraph(
  graph: FranchiseGraph,
  filters: Set<RelationFilter>,
): FilteredGraph {
  const filteredEdges = graph.edges.filter((e) =>
    Array.from(filters).some((g) => FILTER_GROUPS[g].includes(e.relation_type)),
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
            n.media_type == null),
      )
      .map((n) => [n.id, n]),
  );
  const edges = filteredEdges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
  );
  return { edges, ids, nodeMap };
}

export function getClusterX(
  nodeId: number,
  rootId: number,
  containerW: number,
  edges: { source: number; target: number; relation_type: string }[],
): number {
  if (nodeId === rootId) return containerW / 2;

  const edge = edges.find(
    (e) =>
      (e.source === rootId && e.target === nodeId) ||
      (e.target === rootId && e.source === nodeId),
  );
  if (edge) {
    const ratio = RELATION_X[edge.relation_type] ?? 0.5;
    return containerW * ratio;
  }

  const indirect = edges.find(
    (e) => e.source === nodeId || e.target === nodeId,
  );
  if (indirect) {
    const ratio = RELATION_X[indirect.relation_type] ?? 0.5;
    return containerW * ratio;
  }

  return containerW / 2;
}

export function filterFranchiseNodesBySearch(
  nodeMap: Map<number, FranchiseNode>,
  query: string,
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

export function buildEntryLookup(lists: AniListCollection[]) {
  const map = new Map<
    number,
    { progress: number | null; score: number | null; list_status: string }
  >();
  for (const list of lists) {
    for (const e of list.entries) {
      map.set(e.media.id, {
        progress: e.progress,
        score: e.score,
        list_status: e.list_status,
      });
    }
  }
  return map;
}

export function searchFiltersToParams(
  filters: SearchFilters,
  query: string | null,
  perPage: number,
  maxPages: number,
) {
  return {
    query,
    tags: filters.tags.length > 0 ? filters.tags : null,
    genres: filters.genres.length > 0 ? filters.genres : null,
    format: filters.format || null,
    status: filters.status || null,
    season: filters.season || null,
    seasonYear: filters.seasonYear,
    adult: filters.adult || null,
    sort: filters.sort ? [filters.sort] : null,
    source: filters.source || null,
    country: filters.country || null,
    yearFrom: filters.year[0] > 0 ? filters.year[0] : null,
    yearTo: filters.year[1] > 0 ? filters.year[1] : null,
    episodesFrom:
      filters.episodes[0] > 0 || filters.episodes[1] > 0
        ? filters.episodes[0]
        : null,
    episodesTo:
      filters.episodes[0] > 0 || filters.episodes[1] > 0
        ? filters.episodes[1]
        : null,
    scoreFrom:
      filters.score[0] > 0 || filters.score[1] > 0 ? filters.score[0] : null,
    scoreTo:
      filters.score[0] > 0 || filters.score[1] > 0 ? filters.score[1] : null,
    maxPages,
    perPage,
  };
}

export function sortAniMediaList(
  results: AniMedia[],
  key: string,
  dir: "asc" | "desc",
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
    w: Math.round(NODE_W * scale),
    h: imgH + barH,
    imgH,
    scale,
  };
}

export interface NodeDimensionsTag {
  w: number;
  h: number;
  imgH: number;
  scale: number;
}

export function computeGraphMetrics(nodeCount: number) {
  const totalH = Math.max(300, Math.min(1400, nodeCount * 80));
  const displayH = Math.max(300, Math.min(totalH, 600));
  return { totalH, displayH };
}

export function clampPosition(
  x: number,
  y: number,
  bounds: { w: number; h: number; nodeW: number; nodeH: number },
): FranchiseNodePosition {
  return {
    x: Math.max(0, Math.min(bounds.w - bounds.nodeW, x)),
    y: Math.max(0, Math.min(bounds.h - bounds.nodeH, y)),
  };
}

export function buildSimNodes(
  filtered: FilteredGraph,
  containerW: number,
  rootId: number,
  totalH: number,
  dims: { w: number; h: number },
) {
  const nodes: SimNode[] = [];
  const initPos = new Map<number, FranchiseNodePosition>();
  const values = [...filtered.nodeMap.values()];

  const years = values.map((n) => n.year).filter((y): y is number => y != null);
  const minYear = years.length > 0 ? Math.min(...years) : NaN;
  const maxYear = years.length > 0 ? Math.max(...years) : NaN;
  const yearRange = maxYear - minYear || 1;

  let idx = 0;
  for (const node of values) {
    let y: number;
    if (node.year != null && !isNaN(minYear)) {
      const t = (node.year - minYear) / yearRange;
      y = 20 + t * (totalH - dims.h - 40);
    } else {
      y = 20 + (idx / values.length) * (totalH - dims.h - 40);
    }
    idx++;

    const clusterX = getClusterX(node.id, rootId, containerW, filtered.edges);
    nodes.push({
      id: node.id,
      x: clusterX,
      y,
      vx: 0,
      vy: 0,
      fy: y,
      clusterX,
    });
    initPos.set(
      node.id,
      clampPosition(clusterX - dims.w / 2, y, {
        w: containerW,
        h: totalH,
        nodeW: dims.w,
        nodeH: dims.h,
      }),
    );
  }

  return { simNodes: nodes, initialPositions: initPos };
}

export function runFranchiseSimulation(
  simNodes: SimNode[],
  containerW: number,
  totalH: number,
  dims: { w: number; h: number },
  onTick: (positions: Map<number, FranchiseNodePosition>) => void,
): Simulation<SimNode, undefined> {
  const sim = forceSimulation(simNodes)
    .force("x", forceX<SimNode>((d) => d.clusterX).strength(0.06))
    .force("collide", forceCollide(dims.w * 0.8))
    .alphaDecay(0.025)
    .on("tick", () => {
      const pos = new Map<number, FranchiseNodePosition>();
      for (const n of sim.nodes()) {
        pos.set(
          n.id,
          clampPosition(n.x - dims.w / 2, n.y - dims.h / 2, {
            w: containerW,
            h: totalH,
            nodeW: dims.w,
            nodeH: dims.h,
          }),
        );
      }
      onTick(pos);
    });

  return sim;
}

export function getFitToViewTransform(
  positions: Map<number, FranchiseNodePosition>,
  containerW: number,
  containerH: number,
  dims: { w: number; h: number },
  padding = 20,
) {
  if (positions.size === 0) return { x: 0, y: 0, scale: 1 };

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + dims.w);
    maxY = Math.max(maxY, p.y + dims.h);
  }

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  if (bboxW <= 0 || bboxH <= 0) return { x: 0, y: 0, scale: 1 };

  const scale = Math.min(
    (containerW - padding * 2) / bboxW,
    (containerH - padding * 2) / bboxH,
    1.5,
  );

  const x = (containerW - bboxW * scale) / 2 - minX * scale;
  const y = (containerH - bboxH * scale) / 2 - minY * scale;

  return { x, y, scale };
}
