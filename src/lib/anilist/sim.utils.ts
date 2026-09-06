import { forceSimulation, forceX, forceCollide } from "d3-force";
import type { Simulation } from "d3-force";

import { IMG_H, NODE_H, NODE_W, RELATION_X } from "@/config/anilist/graph.config";
import type { FilteredGraph, FranchiseNode, FranchiseNodePosition, SimNode } from "@/types/anilist";

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
    const jitter = getNodeJitter(
      node,
      rootId,
      mainlineIds,
      relationMap,
      groupCount,
      groupIndex,
      dims.w
    );
    const clusterX = mainlineIds.has(node.id)
      ? containerW / 2
      : getClusterX(node.id, rootId, containerW, relationMap, jitter);
    nodes.push({ clusterX, fy: y, id: node.id, vx: 0, vy: 0, x: clusterX, y });
    initPos.set(
      node.id,
      clampPosition(clusterX - dims.w / 2, y, {
        h: totalH,
        nodeH: dims.h,
        nodeW: dims.w,
        w: containerW,
      })
    );
  }
  return { initialPositions: initPos, simNodes: nodes };
}

const SIM_TICK_MS = 50;

function readPositions(
  sim: Simulation<SimNode, undefined>,
  containerW: number,
  totalH: number,
  dims: { w: number; h: number }
): Map<number, FranchiseNodePosition> {
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
  return pos;
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
    .alphaDecay(0.025);
  let lastForward = 0;
  sim
    .on("tick", () => {
      const now = Date.now();
      if (now - lastForward < SIM_TICK_MS) return;
      lastForward = now;
      onTick(readPositions(sim, containerW, totalH, dims));
    })
    .on("end", () => {
      onTick(readPositions(sim, containerW, totalH, dims));
    });

  return sim;
}
