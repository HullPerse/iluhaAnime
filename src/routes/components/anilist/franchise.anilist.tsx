import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import type {
  FranchiseGraph,
  FranchiseNodePosition,
  DragState,
  ContextMenuState,
  RelationFilter,
  SimNode,
  FranchiseNode,
  FranchiseGraphSectionProps,
} from "@/types/anilist";
import { SmallLoader } from "@/components/shared/loader.component";
import {
  EDGE_STYLES,
  FILTER_LABELS,
  IMG_H,
  NODE_H,
  NODE_W,
  RELATION_FILTERS,
} from "@/config/anilist.config";
import { useCacheStore } from "@/store/cache.store";
import {
  filterGraph,
  getClusterX,
  filterFranchiseNodesBySearch,
} from "@/lib/anilist.utils";
import { FranNode } from "./node.anilist";

function FranchiseGraphSection({
  animeId,
  onRelated,
  expanded = false,
}: FranchiseGraphSectionProps) {
  const [activeFilters, setActiveFilters] = useState<Set<RelationFilter>>(
    () => new Set(RELATION_FILTERS),
  );
  const [positions, setPositions] = useState<
    Map<number, FranchiseNodePosition>
  >(new Map());
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const dragMovedRef = useRef(false);
  const zoomedOnceRef = useRef(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["franchise", animeId, refreshKey],
    queryFn: async () => {
      if (!refreshKey) {
        const cached = useCacheStore.getState().franchiseCache[String(animeId)];
        if (cached) return cached;
      }
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

  const searchMatchIds = useMemo(
    () =>
      filtered
        ? filterFranchiseNodesBySearch(filtered.nodeMap, searchQuery)
        : null,
    [searchQuery, filtered],
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

  const resetSimulation = useCallback(() => {
    setResetKey((k) => k + 1);
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
  }, [filtered, animeId, containerWidth, resetKey]);

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

  const handleNodeContextMenu = (e: React.MouseEvent, node: FranchiseNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const toggleFilter = (group: RelationFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-sm">
        <span className="text-red-500">
          Ошибка загрузки: {(error as any)?.message ?? "Неизвестная ошибка"}
        </span>
        <button
          onClick={() => refetch()}
          className="px-2 py-1 bg-gray-800 text-white text-[10px] cursor-pointer hover:bg-gray-600"
        >
          Повторить
        </button>
      </div>
    );
  }

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
  const totalNodes = filtered?.nodeMap.size ?? 0;
  const containerH = Math.max(300, Math.min(1400, totalNodes * 80));
  const displayContainerH = Math.max(300, Math.min(containerH, 600));

  return (
    <main className="flex flex-col gap-1.5">
      <section className="flex flex-wrap gap-1 items-center">
        <div className="flex flex-wrap gap-1">
          {RELATION_FILTERS.map((group) => (
            <button
              key={group}
              onClick={() => toggleFilter(group)}
              className={cn(
                "px-1.5 py-0.5 text-[10px] border cursor-pointer select-none transition-colors duration-200",
                activeFilters.has(group)
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100",
              )}
            >
              {FILTER_LABELS[group]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-20 px-1 py-0.5 text-[10px] border border-gray-300 outline-none"
          />
          <button
            onClick={resetSimulation}
            className="px-1.5 py-0.5 text-[10px] border border-gray-300 bg-white text-gray-600 cursor-pointer hover:bg-gray-100"
            title="Сбросить расположение"
          >
            Сбросить
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="px-1.5 py-0.5 text-[10px] border border-gray-300 bg-white text-gray-600 cursor-pointer hover:bg-gray-100"
            title="Обновить данные"
          >
            Обновить
          </button>
        </div>
      </section>

      <section
        ref={containerRef}
        className="border border-gray-300 bg-gray-50 relative"
        style={{ height: displayContainerH, overflow: "hidden" }}
      >
        <div className="absolute top-1 left-1 z-10 text-[9px] text-gray-400 bg-white/80 px-0.5">
          Узлы: {pos.size} / {totalNodes}
        </div>

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
                  const style = EDGE_STYLES[e.relation_type] ?? {
                    color: "#bdc3c7",
                    dash: "2,2",
                    width: 0.75,
                  };

                  return (
                    <line
                      key={i}
                      x1={ps.x + NODE_W / 2}
                      y1={ps.y + IMG_H / 2}
                      x2={pt.x + NODE_W / 2}
                      y2={pt.y + IMG_H / 2}
                      stroke={style.color}
                      strokeWidth={style.width}
                      strokeDasharray={style.dash}
                    />
                  );
                })}
              </svg>
              {pos.size > 0 &&
                filtered?.nodeMap &&
                [...filtered.nodeMap.values()].map((node) => {
                  const p = pos.get(node.id);
                  if (!p) return null;
                  const dimmed =
                    searchMatchIds !== null && !searchMatchIds.has(node.id);
                  return (
                    <FranNode
                      key={node.id}
                      node={node}
                      x={p.x}
                      y={p.y}
                      isRoot={node.id === animeId}
                      onRelated={handleNodeClick}
                      onMouseDown={handleNodeMouseDown}
                      onContextMenu={handleNodeContextMenu}
                      id={`franchise-node-${node.id}`}
                      dimmed={dimmed}
                    />
                  );
                })}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </section>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-white border border-gray-300 shadow-md py-0.5 min-w-32"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                window.open(
                  `https://anilist.co/anime/${contextMenu.node.id}`,
                  "_blank",
                );
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-0.5 text-[11px] hover:bg-gray-100 cursor-pointer"
            >
              Открыть в AniList
            </button>
            <button
              onClick={() => {
                onRelated?.(contextMenu.node.id);
                setContextMenu(null);
              }}
              className="w-full text-left px-2 py-0.5 text-[11px] hover:bg-gray-100 cursor-pointer"
            >
              Показать связи
            </button>
            <button
              onClick={() => setContextMenu(null)}
              className="w-full text-left px-2 py-0.5 text-[11px] hover:bg-gray-100 cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default FranchiseGraphSection;
