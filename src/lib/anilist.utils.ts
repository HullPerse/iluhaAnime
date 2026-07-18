import { FILTER_GROUPS, RELATION_X } from "@/config/anilist.config";
import { HexType } from "@/types";
import type {
  AniListCollection,
  AniListEntry,
  AniListSort,
  AniMedia,
  FranchiseGraph,
  FranchiseNode,
  RelationFilter,
  SearchFilters,
} from "@/types/anilist";

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

export function filterGraph(
  graph: FranchiseGraph,
  filters: Set<RelationFilter>,
) {
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
