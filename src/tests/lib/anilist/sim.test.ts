import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSimNodes,
  computeGraphMetrics,
  computeNodeDimensions,
  runFranchiseSimulation,
} from "@/lib/anilist/sim.utils";
import type { FranchiseNode, FranchiseNodePosition } from "@/types/anilist";

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

describe("computeNodeDimensions", () => {
  it("scales down for large graphs", () => {
    expect(computeNodeDimensions(10).scale).toBe(1);
    expect(computeNodeDimensions(20).scale).toBe(0.85);
    expect(computeNodeDimensions(30).scale).toBe(0.75);
  });

  it("scales dimensions for large graphs", () => {
    const dims = computeNodeDimensions(30);
    expect(dims.imgH).toBe(60);
    expect(dims.w).toBe(53);
    expect(dims.h).toBe(76);
  });
});

describe("computeGraphMetrics", () => {
  it("clamps the total height within bounds", () => {
    expect(computeGraphMetrics(2).totalH).toBe(300);
    expect(computeGraphMetrics(5).totalH).toBe(400);
    expect(computeGraphMetrics(50).totalH).toBe(1400);
  });

  it("clamps the display height", () => {
    expect(computeGraphMetrics(2).displayH).toBe(300);
    expect(computeGraphMetrics(5).displayH).toBe(400);
    expect(computeGraphMetrics(50).displayH).toBe(600);
  });
});

describe("buildSimNodes", () => {
  it("centers the root node and lays out related nodes", () => {
    const nodeMap = new Map([
      [1, makeNode({ id: 1, year: 2002 })],
      [2, makeNode({ id: 2, title: "Naruto Shippuden", year: 2007 })],
    ]);
    const filtered = {
      edges: [{ relation_type: "SEQUEL", source: 1, target: 2 }],
      ids: new Set([1, 2]),
      nodeMap,
    };
    const relationMap = new Map<number, string>([
      [1, "ROOT"],
      [2, "SEQUEL"],
    ]);
    const { simNodes } = buildSimNodes(filtered, 1000, 1, 600, { h: 95, w: 70 }, relationMap);
    expect(simNodes).toHaveLength(2);
    const root = simNodes.find((n) => n.id === 1)!;
    expect(root.clusterX).toBe(500);
    const sequel = simNodes.find((n) => n.id === 2)!;
    expect(sequel.clusterX).toBe(750);
  });

  it("centers mainline nodes on the timeline", () => {
    const nodeMap = new Map([
      [1, makeNode({ id: 1, year: 2002 })],
      [2, makeNode({ id: 2, title: "Naruto Shippuden", year: 2007 })],
    ]);
    const filtered = {
      edges: [{ relation_type: "SEQUEL", source: 1, target: 2 }],
      ids: new Set([1, 2]),
      nodeMap,
    };
    const relationMap = new Map<number, string>([
      [1, "ROOT"],
      [2, "SEQUEL"],
    ]);
    const { simNodes } = buildSimNodes(
      filtered,
      1000,
      1,
      600,
      { h: 95, w: 70 },
      relationMap,
      new Set([2])
    );
    const sequel = simNodes.find((n) => n.id === 2)!;
    expect(sequel.clusterX).toBe(500);
  });
});

describe("runFranchiseSimulation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards throttled ticks and final positions on end", () => {
    const seen: Map<number, FranchiseNodePosition>[] = [];
    const sim = runFranchiseSimulation(
      [
        { id: 1, clusterX: 100, x: 100, y: 100, vx: 0, vy: 0 },
        { id: 2, clusterX: 400, x: 400, y: 100, vx: 0, vy: 0 },
      ] as never,
      800,
      600,
      { w: 70, h: 95 },
      (pos) => {
        seen.push(pos);
      }
    );
    vi.advanceTimersByTime(10000);
    sim.stop();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(200);
    const last = seen.at(-1)!;
    expect(last.has(1)).toBe(true);
    expect(last.has(2)).toBe(true);
  });
});
