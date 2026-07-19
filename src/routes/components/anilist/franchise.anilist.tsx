import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { type Simulation } from "d3-force";
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
  RelationFilter,
  SimNode,
  FranchiseGraphSectionProps,
} from "@/types/anilist";
import { SmallLoader } from "@/components/shared/loader.component";
import {
  EDGE_STYLES,
  FILTER_LABELS,
  RELATION_FILTERS,
} from "@/config/anilist.config";
import { useCacheStore } from "@/store/cache.store";
import {
  filterGraph,
  filterFranchiseNodesBySearch,
  computeNodeDimensions,
  computeGraphMetrics,
  buildSimNodes,
  runFranchiseSimulation,
} from "@/lib/anilist.utils";
import { FranNode } from "./node.anilist";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useSettingsStore } from "@/store/settings.store";

function FranchiseGraphSection({
  animeId,
  onRelated,
  expanded = false,
}: FranchiseGraphSectionProps) {
  const franchiseRelationScope = useSettingsStore(
    (s) => s.franchiseRelationScope,
  );
  const [activeFilters, setActiveFilters] = useState<Set<RelationFilter>>(
    () =>
      franchiseRelationScope === "main"
        ? new Set(["SEQUEL", "PREQUEL"])
        : new Set(RELATION_FILTERS),
  );
  const [positions, setPositions] = useState<
    Map<number, FranchiseNodePosition>
  >(new Map());
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const dragMovedRef = useRef(false);
  const zoomedOnceRef = useRef(false);
  const positionsRef = useRef(positions);
  useEffect(() => { positionsRef.current = positions; }, [positions]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["franchise", animeId, franchiseRelationScope, refreshKey],
    queryFn: async () => {
      const cacheKey = `${animeId}:${franchiseRelationScope}`;
      if (!refreshKey) {
        const cached = useCacheStore.getState().franchiseCache[cacheKey];
        if (cached) return cached;
      }
      const result = await invoke<FranchiseGraph>("get_anime_franchise", {
        id: animeId,
        scope: franchiseRelationScope,
      });
      useCacheStore.getState().setFranchiseCache(cacheKey, result);
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

  const totalNodes = filtered?.nodeMap.size ?? 0;
  const dims = useMemo(() => computeNodeDimensions(totalNodes), [totalNodes]);
  const { totalH, displayH } = useMemo(
    () => computeGraphMetrics(totalNodes),
    [totalNodes],
  );

  useEffect(() => {
    if (!filtered || filtered.nodeMap.size === 0) return;

    const { simNodes, initialPositions } = buildSimNodes(
      filtered,
      containerWidth,
      animeId,
      totalH,
      dims,
    );

    setPositions(initialPositions);

    const sim = runFranchiseSimulation(
      simNodes,
      containerWidth,
      totalH,
      dims,
      (nextPositions) => {
        setPositions(nextPositions);
      },
    );

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [filtered, animeId, containerWidth, totalH, dims, resetKey]);

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
    if (
      !expanded ||
      positions.size === 0 ||
      zoomedOnceRef.current ||
      !transformRef.current
    )
      return;
    zoomedOnceRef.current = true;
    requestAnimationFrame(() => {
      transformRef.current?.zoomToElement(
        `franchise-node-${animeId}`,
        1.5,
        300,
      );
    });
  }, [expanded, positions, animeId]);

  const handleNodeClick = useCallback((nodeId: number) => {
    if (dragMovedRef.current) return;
    onRelated?.(nodeId);
  }, [onRelated]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragMovedRef.current = false;
    simRef.current?.alpha(0).stop();
    const p = positionsRef.current.get(nodeId);
    if (!p) return;
    setDragging({
      id: nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: p.x,
      startNodeY: p.y,
    });
  }, []);

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
        <span className="text-destructive windows95-text">
          Ошибка загрузки: {(error as any)?.message ?? "Неизвестная ошибка"}
        </span>
        <Button
          onClick={() => refetch()}
          className="px-2 py-1 text-[10px] cursor-pointer"
          variant="default"
        >
          Повторить
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-20">
        <SmallLoader />
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-muted text-sm windows95-text">
        Нет данных
      </div>
    );
  }

  const pos = positions;

  return (
    <main className="flex flex-col gap-1.5">
      <section className="flex flex-wrap gap-1 items-center">
        <div className="flex flex-wrap gap-1">
          {RELATION_FILTERS.map((group) => (
            <Button
              key={group}
              onClick={() => toggleFilter(group)}
              variant="default"
              className={cn(
                "px-1.5 py-0.5 text-[10px] h-auto",
                activeFilters.has(group) && "bg-secondary text-white",
              )}
            >
              {FILTER_LABELS[group]}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto items-center">
          <Input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-24 text-[10px] h-6"
          />
          <Button
            onClick={resetSimulation}
            className="text-[10px] h-auto px-1.5 py-0.5"
            variant="default"
            title="Сбросить расположение"
          >
            Сбросить
          </Button>
          <Button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-[10px] h-auto px-1.5 py-0.5"
            variant="default"
            title="Обновить данные"
          >
            Обновить
          </Button>
        </div>
      </section>

      <section
        ref={containerRef}
        className="windows95-border bg-white relative"
        style={{ height: displayH, overflow: "hidden" }}
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
                height: totalH,
                position: "relative",
              }}
            >
              <svg
                width={containerWidth}
                height={totalH}
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
                      x1={ps.x + dims.w / 2}
                      y1={ps.y + dims.imgH / 2}
                      x2={pt.x + dims.w / 2}
                      y2={pt.y + dims.imgH / 2}
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
                      id={`franchise-node-${node.id}`}
                      dimmed={dimmed}
                      dims={dims}
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
