import { RELATION_FILTERS } from "@/config/graph.config";
import type { FranchiseEdge, FranchiseNode, RelationFilter } from "@/types/anilist";

import type { EntryLookup } from "@/lib/entries.utils";
import { relationGroup, sortFranchiseNodes } from "@/lib/graph.utils";

export interface FranchiseSection {
  key: "mainline" | RelationFilter;
  items: FranchiseNode[];
}

export interface FranchiseNext {
  id: number;
  episode: number | null;
}

export interface FranchiseSummary {
  titles: number;
  episodes: number;
  watched: number;
  percent: number | null;
}

function byYearAndTitle(a: FranchiseNode, b: FranchiseNode): number {
  const yearA = a.year ?? Number.MAX_SAFE_INTEGER;
  const yearB = b.year ?? Number.MAX_SAFE_INTEGER;
  if (yearA !== yearB) return yearA - yearB;
  const byTitle = a.title.localeCompare(b.title);
  return byTitle === 0 ? a.id - b.id : byTitle;
}

function buildMainlineGraph(
  mainline: FranchiseNode[],
  edges: FranchiseEdge[]
): {
  byId: Map<number, FranchiseNode>;
  next: Map<number, Set<number>>;
  indegree: Map<number, number>;
} {
  const byId = new Map(mainline.map((node) => [node.id, node]));
  const next = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  for (const id of byId.keys()) {
    next.set(id, new Set());
    indegree.set(id, 0);
  }
  for (const edge of edges) {
    if (edge.relation_type !== "SEQUEL" && edge.relation_type !== "PREQUEL") continue;
    if (!byId.has(edge.source) || !byId.has(edge.target) || edge.source === edge.target) continue;
    const from = edge.relation_type === "PREQUEL" ? edge.target : edge.source;
    const to = edge.relation_type === "PREQUEL" ? edge.source : edge.target;
    if (next.get(from)?.has(to)) continue;
    next.get(from)?.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  return { byId, indegree, next };
}

function drainMainline(
  byId: Map<number, FranchiseNode>,
  next: Map<number, Set<number>>,
  indegree: Map<number, number>
): FranchiseNode[] {
  const ready = [...byId.values()]
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort(byYearAndTitle);
  const ordered: FranchiseNode[] = [];
  while (ready.length > 0) {
    const node = ready.shift();
    if (!node) break;
    ordered.push(node);
    for (const targetId of next.get(node.id) ?? []) {
      const left = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, left);
      if (left !== 0) continue;
      const target = byId.get(targetId);
      if (target) {
        ready.push(target);
        ready.sort(byYearAndTitle);
      }
    }
  }
  return ordered;
}

/**
 * Watch order of the main line: sequel and prequel edges decide direction, year
 * and title only break ties. Nodes left in a cycle fall back to the same order
 * instead of being dropped.
 */
export function orderMainline(
  nodes: FranchiseNode[],
  edges: FranchiseEdge[],
  mainlineIds: Set<number>
): FranchiseNode[] {
  const mainline = nodes.filter((node) => mainlineIds.has(node.id));
  if (mainline.length <= 1) return mainline.sort(byYearAndTitle);

  const { byId, next, indegree } = buildMainlineGraph(mainline, edges);
  const ordered = drainMainline(byId, next, indegree);
  if (ordered.length === mainline.length) return ordered;

  const placed = new Set(ordered.map((node) => node.id));
  ordered.push(...mainline.filter((node) => !placed.has(node.id)).sort(byYearAndTitle));
  return ordered;
}

export function buildFranchiseSections(
  nodes: FranchiseNode[],
  edges: FranchiseEdge[],
  mainlineIds: Set<number>,
  relationMap: Map<number, string>
): FranchiseSection[] {
  const mainline = orderMainline(nodes, edges, mainlineIds);
  const sections: FranchiseSection[] = [];
  if (mainline.length > 0) sections.push({ key: "mainline", items: mainline });

  const buckets = new Map<RelationFilter, FranchiseNode[]>();
  for (const node of nodes) {
    if (mainlineIds.has(node.id)) continue;
    const group = relationGroup(relationMap.get(node.id) ?? "UNKNOWN");
    const bucket = buckets.get(group);
    if (bucket) bucket.push(node);
    else buckets.set(group, [node]);
  }

  for (const group of RELATION_FILTERS) {
    const items = sortFranchiseNodes(buckets.get(group) ?? []);
    if (items.length > 0) sections.push({ key: group, items });
  }
  return sections;
}

export function countFranchiseGroups(
  nodes: FranchiseNode[],
  relationMap: Map<number, string>,
  rootId: number
): Record<RelationFilter, number> {
  const counts = {} as Record<RelationFilter, number>;
  for (const group of RELATION_FILTERS) counts[group] = 0;
  for (const node of nodes) {
    if (node.id === rootId) continue;
    counts[relationGroup(relationMap.get(node.id) ?? "UNKNOWN")] += 1;
  }
  return counts;
}

/**
 * Episodes that have actually been released. Airing titles count only the
 * episodes behind the next one, so a caught-up season reads as complete instead
 * of dragging the franchise down with episodes nobody can watch yet. When the
 * next episode time already passed, that episode counts too, because the cache
 * can be a few hours old. An unknown status falls back to the planned count so
 * old payloads keep their previous behavior.
 */
export function availableEpisodes(node: FranchiseNode, nowSeconds: number): number {
  const planned = node.episodes != null && node.episodes > 0 ? node.episodes : null;
  if (node.status === "NOT_YET_RELEASED") return 0;
  if (node.status === "RELEASING") {
    const next = node.next_airing_episode;
    if (!next) return planned ?? 0;
    const aired = Math.max(0, nowSeconds >= next.airing_at ? next.episode : next.episode - 1);
    return planned == null ? aired : Math.min(planned, aired);
  }
  return planned ?? 0;
}

/**
 * The first title in watch order that has something to watch. Announced titles
 * are skipped, and so is an airing season the user already caught up with, so
 * the marker never points at an episode that has not aired. A title whose
 * progress reached its released episode count is treated as finished even when
 * it still sits in CURRENT.
 */
export function pickNextToWatch(
  mainline: FranchiseNode[],
  entryLookup: EntryLookup | undefined,
  nowSeconds: number
): FranchiseNext | null {
  if (!entryLookup) return null;
  for (const node of mainline) {
    if (node.status === "NOT_YET_RELEASED") continue;
    const aired = availableEpisodes(node, nowSeconds);
    if (node.status === "RELEASING" && aired === 0) continue;
    const entry = entryLookup.get(node.id);
    if (!entry) return { episode: null, id: node.id };
    const done = entry.progress;
    const finished =
      entry.list_status === "COMPLETED" || (aired > 0 && done != null && done >= aired);
    if (finished) continue;
    return { episode: done == null ? null : done + 1, id: node.id };
  }
  return null;
}

/**
 * Watched share of the released episodes. Not-yet-released titles and the
 * unaired tail of an airing season stay out of both sides of the fraction, so a
 * user who watched everything that exists reads as complete.
 */
export function franchiseSummary(
  nodes: FranchiseNode[],
  entryLookup: EntryLookup | undefined,
  nowSeconds: number
): FranchiseSummary {
  let episodes = 0;
  let watched = 0;
  for (const node of nodes) {
    const aired = availableEpisodes(node, nowSeconds);
    episodes += aired;
    if (aired === 0) continue;
    const entry = entryLookup?.get(node.id);
    if (!entry) continue;
    if (entry.progress != null) {
      watched += Math.min(entry.progress, aired);
    } else if (entry.list_status === "COMPLETED") {
      watched += aired;
    }
  }
  const percent = episodes > 0 ? Math.min(100, Math.round((watched / episodes) * 100)) : null;
  return {
    episodes,
    percent,
    titles: nodes.length,
    watched: episodes > 0 ? Math.min(watched, episodes) : watched,
  };
}
