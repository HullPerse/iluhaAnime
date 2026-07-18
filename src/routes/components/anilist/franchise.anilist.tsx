import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  forceSimulation,
  forceX,
  forceCollide,
  type Simulation,
} from "d3-force";
import { cn } from "@/lib/index.utils";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { FranchiseGraph, RelationFilter, SimNode } from "@/types/anilist";
import { SmallLoader } from "@/components/shared/loader.component";
import {
  FILTER_LABELS,
  IMG_H,
  NODE_H,
  NODE_W,
  RELATION_FILTERS,
} from "@/config/anilist.config";
import { useCacheStore } from "@/store/cache.store";
import { filterGraph, getClusterX, getEdgeStyle } from "@/lib/anilist.utils";
import { FranNode } from "./node.anilist";

function FranchiseGraphSection({
  animeId,
  onRelated,
  expanded = false,
}: {
  animeId: number;
  onRelated?: (id: number) => void;
  expanded?: boolean;
}) {
  const [activeFilters, setActiveFilters] = useState<Set<RelationFilter>>(
    () => new Set(RELATION_FILTERS),
  );
  const [positions, setPositions] = useState<
    Map<number, { x: number; y: number }>
  >(new Map());
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragging, setDragging] = useState<{
    id: number;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const dragMovedRef = useRef(false);
  const zoomedOnceRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["franchise", animeId],
    queryFn: async () => {
      const cached = useCacheStore.getState().franchiseCache[String(animeId)];
      if (cached) return cached;
      const result = await invoke<FranchiseGraph>("get_anime_franchise", {
        id: animeId,
      });
      useCacheStore.getState().setFranchiseCache(animeId, result);
      return result;
    },
    staleTime: Infinity,
  });

  const filtered = useMemo(
    () => (data ? filterGraph(data, activeFilters) : null),
    [data, activeFilters],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width || 800);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!filtered || filtered.nodeMap.size === 0) return;

    const containerW = containerWidth;
    const totalH = Math.max(300, Math.min(1400, filtered.nodeMap.size * 80));

    const years = [...filtered.nodeMap.values()]
      .map((n) => n.year)
      .filter((y) => y != null) as number[];
    const minYear = years.length > 0 ? Math.min(...years) : NaN;
    const maxYear = years.length > 0 ? Math.max(...years) : NaN;
    const yearRange = maxYear - minYear || 1;

    const nodes: SimNode[] = [];
    const initPos = new Map<number, { x: number; y: number }>();

    let idx = 0;
    for (const node of filtered.nodeMap.values()) {
      let y: number;
      if (node.year != null && !isNaN(minYear)) {
        const t = (node.year - minYear) / yearRange;
        y = 20 + t * (totalH - NODE_H - 40);
      } else {
        y = 20 + (idx / filtered.nodeMap.size) * (totalH - NODE_H - 40);
      }
      idx++;

      const clusterX = getClusterX(
        node.id,
        animeId,
        containerW,
        filtered.edges,
      );

      nodes.push({
        id: node.id,
        x: clusterX,
        y,
        vx: 0,
        vy: 0,
        fy: y,
        clusterX,
      });
      initPos.set(node.id, {
        x: Math.max(0, Math.min(containerW - NODE_W, clusterX - NODE_W / 2)),
        y: Math.max(0, Math.min(totalH - NODE_H, y)),
      });
    }

    setPositions(initPos);

    const sim = forceSimulation(nodes)
      .force("x", forceX<SimNode>((d) => d.clusterX).strength(0.06))
      .force("collide", forceCollide(NODE_W * 0.8))
      .alphaDecay(0.025)
      .on("tick", () => {
        const pos = new Map<number, { x: number; y: number }>();
        for (const n of sim.nodes()) {
          pos.set(n.id, {
            x: Math.max(0, Math.min(containerW - NODE_W, n.x - NODE_W / 2)),
            y: Math.max(0, Math.min(totalH - NODE_H, n.y - NODE_H / 2)),
          });
        }
        setPositions(pos);
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [filtered, animeId, containerWidth]);

  useEffect(() => {
    if (!dragging || !transformRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { state } = transformRef.current!;
      const dx = (e.clientX - dragging.startMouseX) / state.scale;
      const dy = (e.clientY - dragging.startMouseY) / state.scale;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMovedRef.current = true;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(dragging.id, {
          x: dragging.startNodeX + dx,
          y: dragging.startNodeY + dy,
        });
        return next;
      });
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!expanded || positions.size === 0 || zoomedOnceRef.current) return;
    zoomedOnceRef.current = true;
    requestAnimationFrame(() => {
      transformRef.current?.zoomToElement(
        `franchise-node-${animeId}`,
        1.5,
        300,
      );
    });
  }, [expanded, positions, animeId]);

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragMovedRef.current = false;
    simRef.current?.alpha(0).stop();
    const p = positions.get(nodeId);
    if (!p) return;
    setDragging({
      id: nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: p.x,
      startNodeY: p.y,
    });
  };

  const handleNodeClick = (nodeId: number) => {
    if (dragMovedRef.current) return;
    onRelated?.(nodeId);
  };

  const toggleFilter = (group: RelationFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (isLoading) {
    return <SmallLoader />;
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
        Нет данных
      </div>
    );
  }

  const pos = positions;
  const containerH = Math.max(
    300,
    Math.min(1400, (filtered?.nodeMap.size ?? 0) * 80),
  );

  return (
    <main className="flex flex-col gap-1.5">
      <section className="flex flex-wrap gap-1">
        {RELATION_FILTERS.map((group) => (
          <button
            key={group}
            onClick={() => toggleFilter(group)}
            className={cn(
              "px-1.5 py-0.5 text-[10px] border cursor-pointer select-none",
              activeFilters.has(group)
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100",
            )}
          >
            {FILTER_LABELS[group]}
          </button>
        ))}
      </section>

      <section
        ref={containerRef}
        className="border border-gray-300 bg-gray-50"
        style={{ height: "360px", overflow: "hidden" }}
      >
        <TransformWrapper
          ref={transformRef}
          limitToBounds={false}
          initialScale={0.4}
          minScale={0.1}
          maxScale={5}
          panning={{
            allowLeftClickPan: false,
            allowMiddleClickPan: false,
            allowRightClickPan: true,
          }}
          smooth={false}
          zoomAnimation={{ disabled: true }}
          wheel={{ step: 0.1 }}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
            <div
              style={{
                width: containerWidth,
                height: containerH,
                position: "relative",
              }}
            >
              <svg
                width={containerWidth}
                height={containerH}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              >
                {filtered?.edges.map((e, i) => {
                  const ps = pos.get(e.source);
                  const pt = pos.get(e.target);
                  if (!ps || !pt) return null;
                  const style = getEdgeStyle(e.relation_type);

                  return (
                    <g key={i}>
                      <line
                        x1={ps.x + NODE_W / 2}
                        y1={ps.y + IMG_H / 2}
                        x2={pt.x + NODE_W / 2}
                        y2={pt.y + IMG_H / 2}
                        stroke={style.color}
                        strokeWidth={style.width}
                        strokeDasharray={style.dash}
                      />
                    </g>
                  );
                })}
              </svg>
              {pos.size > 0 &&
                filtered?.nodeMap &&
                [...filtered.nodeMap.values()].map((node) => {
                  const p = pos.get(node.id);
                  if (!p) return null;
                  return (
                    <FranNode
                      key={node.id}
                      node={node}
                      x={p.x}
                      y={p.y}
                      isRoot={node.id === animeId}
                      onRelated={handleNodeClick}
                      onMouseDown={handleNodeMouseDown}
                      id={`franchise-node-${node.id}`}
                    />
                  );
                })}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </section>
    </main>
  );
}

export default FranchiseGraphSection;
