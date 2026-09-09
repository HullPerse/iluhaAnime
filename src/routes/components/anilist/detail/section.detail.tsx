import { useQuery } from "@tanstack/react-query";
import type { Simulation } from "d3-force";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useFranchiseViewport } from "@/hooks/anilist/franchise.hook";
import { collapseGraph } from "@/lib/anilist/collapse.utils";
import {
  filterGraph,
  filterFranchiseNodesBySearch,
  computeNodeRelationMap,
  computeMainlineIds,
} from "@/lib/anilist/graph.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import {
  computeNodeDimensions,
  computeGraphMetrics,
  buildSimNodes,
  runFranchiseSimulation,
} from "@/lib/anilist/sim.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  FranchiseGraph,
  FranchiseNodePosition,
  DragState,
  RelationFilter,
  SimNode,
  FranchiseGraphSectionProps,
} from "@/types/anilist";

import { FranchiseGraph as FranchiseGraphView } from "../franchise/graph.franchise";
import { FranchiseList } from "../franchise/list.franchise";
import { FranchiseToolbar } from "../franchise/toolbar.franchise";

function FranchiseGraphSection({
  animeId,
  onRelated,
  expanded = false,
}: FranchiseGraphSectionProps) {
  const { t } = useI18n();
  const [activeFilters, setActiveFilters] = useState<Set<RelationFilter>>(
    () => new Set(["SEQUEL", "PREQUEL", "SIDE_STORY"])
  );
  const [positions, setPositions] = useState<Map<number, FranchiseNodePosition>>(new Map());
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [listView, setListView] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<RelationFilter>>(new Set());
  const [cacheSource, setCacheSource] = useState<"cache" | "fresh" | null>(null);
  const [countDiff, setCountDiff] = useState<string | null>(null);
  const prevNodeCountRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const viewport = useFranchiseViewport();
  const { getScale, zoomToElement } = viewport;
  const dragMovedRef = useRef(false);
  const dragRafRef = useRef<number | null>(null);
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const zoomedOnceRef = useRef(false);
  const positionsRef = useRef(positions);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["franchise", animeId, refreshKey],
    queryFn: async () => {
      const fresh = await invokeTyped<FranchiseGraph>("get_anime_franchise", {
        id: animeId,
        scope: refreshKey ? "fresh" : "all",
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      });
      setCacheSource("fresh");
      if (prevNodeCountRef.current != null) {
        const prev = prevNodeCountRef.current;
        const cur = fresh.nodes.length;
        if (prev !== cur) {
          setCountDiff(t("anilist.franchise.updated.count", { prev, cur }));
        }
      }
      prevNodeCountRef.current = fresh.nodes.length;
      return fresh;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    setSearchQuery("");
    setCountDiff(null);
    setRefreshKey(0);
    setResetKey((key) => key + 1);
    setExpandedGroups(new Set());
    zoomedOnceRef.current = false;
  }, []);

  useEffect(() => {
    if (data) {
      prevNodeCountRef.current = data.nodes.length;
    }
  }, [data]);

  const filtered = useMemo(
    () => (data ? filterGraph(data, activeFilters) : null),
    [data, activeFilters]
  );

  const relationMap = useMemo(
    () =>
      data && filtered ? computeNodeRelationMap(data, filtered.nodeMap) : new Map<number, string>(),
    [data, filtered]
  );

  const mainlineIds = useMemo(
    () =>
      data && filtered ? computeMainlineIds(data, filtered.nodeMap, animeId) : new Set<number>(),
    [data, filtered, animeId]
  );
  const collapsed = useMemo(() => {
    if (!filtered) return null;
    return collapseGraph(filtered, relationMap, animeId, 10, expandedGroups);
  }, [filtered, relationMap, animeId, expandedGroups]);

  const searchMatchIds = useMemo(
    () => (collapsed ? filterFranchiseNodesBySearch(collapsed.graph.nodeMap, searchQuery) : null),
    [searchQuery, collapsed]
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

  const totalNodes = collapsed?.graph.nodeMap.size ?? 0;
  const dims = useMemo(() => computeNodeDimensions(totalNodes), [totalNodes]);
  const { totalH, displayH } = useMemo(() => computeGraphMetrics(totalNodes), [totalNodes]);

  useEffect(() => {
    if (resetKey < 0) return;
    if (!collapsed || collapsed.graph.nodeMap.size === 0) return;

    const { simNodes, initialPositions } = buildSimNodes(
      collapsed.graph,
      containerWidth,
      animeId,
      totalH,
      dims,
      relationMap,
      mainlineIds
    );

    setPositions(initialPositions);

    const sim = runFranchiseSimulation(simNodes, containerWidth, totalH, dims, (nextPositions) => {
      setPositions(nextPositions);
    });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [collapsed, animeId, containerWidth, totalH, dims, resetKey, relationMap, mainlineIds]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scale = getScale();
      const dx = (e.clientX - dragging.startMouseX) / scale;
      const dy = (e.clientY - dragging.startMouseY) / scale;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMovedRef.current = true;
      dragPointRef.current = { x: dragging.startNodeX + dx, y: dragging.startNodeY + dy };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        const point = dragPointRef.current;
        dragPointRef.current = null;
        if (!point) return;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(dragging.id, point);
          return next;
        });
      });
    };

    const handleMouseUp = () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      dragPointRef.current = null;
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, getScale]);

  useEffect(() => {
    if (!expanded || positions.size === 0 || zoomedOnceRef.current) return;
    zoomedOnceRef.current = true;
    requestAnimationFrame(() => {
      zoomToElement(`franchise-node-${animeId}`, 1.5, 300);
    });
  }, [expanded, positions, animeId, zoomToElement]);

  const handleNodeClick = useCallback(
    (nodeId: number) => {
      if (dragMovedRef.current) return;
      if (nodeId < 0) {
        const info = collapsed?.aggregators.get(nodeId);
        if (!info) return;
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          if (next.has(info.group)) next.delete(info.group);
          else next.add(info.group);
          return next;
        });
        return;
      }
      onRelated?.(nodeId);
    },
    [onRelated, collapsed]
  );

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
          {t("anilist.franchise.load.error", {
            error: error instanceof Error ? error.message : t("anilist.franchise.unknown.error"),
          })}
        </span>
        <Button
          onClick={() => refetch()}
          className="cursor-pointer px-2 py-1 text-xs"
          variant="default"
        >
          {t("anilist.franchise.retry")}
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <SmallLoader />
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="text-hint windows95-text flex h-20 items-center justify-center text-sm">
        {t("anilist.franchise.empty")}
      </div>
    );
  }

  const pos = positions;

  return (
    <div className="flex flex-col gap-1.5">
      <FranchiseToolbar
        activeFilters={activeFilters}
        searchQuery={searchQuery}
        cacheSource={cacheSource}
        countDiff={countDiff}
        listView={listView}
        onToggleFilter={toggleFilter}
        onSearchChange={setSearchQuery}
        onToggleView={() => setListView((value) => !value)}
        onResetLayout={resetSimulation}
        onRefresh={() => {
          setCountDiff(null);
          setRefreshKey((key) => key + 1);
        }}
      />

      <section
        ref={containerRef}
        className="windows95-border relative overflow-hidden bg-white"
        style={{ height: displayH }}
      >
        {listView
          ? collapsed && (
              <FranchiseList
                nodes={[...collapsed.graph.nodeMap.values()]}
                animeId={animeId}
                relationMap={relationMap}
                searchMatchIds={searchMatchIds}
                onNodeClick={handleNodeClick}
              />
            )
          : collapsed && (
              <FranchiseGraphView
                filtered={collapsed.graph}
                animeId={animeId}
                containerWidth={containerWidth}
                totalHeight={totalH}
                dims={dims}
                positions={pos}
                relationMap={relationMap}
                searchMatchIds={searchMatchIds}
                viewport={viewport}
                onNodeClick={handleNodeClick}
                onNodeMouseDown={handleNodeMouseDown}
              />
            )}
      </section>
    </div>
  );
}

export default FranchiseGraphSection;
