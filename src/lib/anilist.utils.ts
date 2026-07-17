import {
  EDGE_STYLES,
  FILTER_GROUPS,
  RELATION_X,
} from "@/config/anilist.config";
import { HexType } from "@/types";
import {
  AniListEntry,
  AniListSort,
  FranchiseGraph,
  RelationFilter,
} from "@/types/anilist";

export const statusLabels: Record<string, string> = {
  FINISHED: "Завершён",
  RELEASING: "Выходит",
  NOT_YET_RELEASED: "Анонс",
  CANCELLED: "Отменён",
  HIATUS: "На паузе",
};

export const formatLabels: Record<string, string> = {
  TV: "ТВ",
  TV_SHORT: "ТВ (короткий)",
  MOVIE: "Фильм",
  SPECIAL: "Спешл",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Клип",
};

export const seasonLabels: Record<string, string> = {
  WINTER: "Зима",
  SPRING: "Весна",
  SUMMER: "Лето",
  FALL: "Осень",
};

const listStatusLabels: Record<string, string> = {
  CURRENT: "Смотрю",
  PLANNING: "Запланировано",
  COMPLETED: "Просмотрено",
  DROPPED: "Брошено",
  PAUSED: "На паузе",
  REPEATING: "Пересматриваю",
  WATCHING: "В процессе",
};

export const listStatusOptions = Object.entries(listStatusLabels).map(
  ([value, label]) => ({ value, label }),
);

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

export function getStatusLabel(status: string) {
  const statusMap = {
    FINISHED: "Завершён",
    RELEASING: "Выходит",
    NOT_YET_RELEASED: "Анонс",
    CANCELLED: "Отменён",
    HIATUS: "На паузе",
  } as Record<string, string>;

  return statusMap[status];
}

export function getListLabel(list: string) {
  return listStatusLabels[list];
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

export function getEdgeStyle(relType: string) {
  return EDGE_STYLES[relType] ?? { color: "#bdc3c7", dash: "2,2", width: 0.75 };
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
