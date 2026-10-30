import type { Simulation } from "d3-force";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useFranchiseViewport } from "@/hooks/anilist/franchise.hook";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { collapseGraph } from "@/lib/collapse.utils";
import { countFranchiseGroups } from "@/lib/franchise.utils";
import {
  filterGraph,
  filterFranchiseNodesBySearch,
  computeNodeRelationMap,
  computeMainlineIds,
  relationGroup,
} from "@/lib/graph.utils";
import {
  computeNodeDimensions,
  computeGraphMetrics,
  buildSimNodes,
  runFranchiseSimulation,
} from "@/lib/sim.utils";
import { scheduleTask, type ScheduledTask } from "@/lib/shared.utils";
import { queryKeys } from "@/lib/keys.utils";
import type {
  FranchiseNodePosition,
  DragState,
  RelationFilter,
  SimNode,
  FranchiseGraphSectionProps,
} from "@/types/anilist";

import { FranchiseGraph as FranchiseGraphView } from "../franchise/graph.franchise";
import { FranchiseList } from "../franchise/list.franchise";
import { FranchiseToolbar } from "../franchise/toolbar.franchise";

const LOADING_HEIGHT = 300;

function FranchiseGraphSection({
  animeId,
  entryLookup,
  scoreFormat,
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
  const [refresh, setRefresh] = useState<{ id: number; key: number }>({ id: animeId, key: 0 });
  const refreshKey = refresh.id === animeId ? refresh.key : 0;
  const [searchQuery, setSearchQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [listView, setListView] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<RelationFilter>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const viewport = useFranchiseViewport();
  const { getScale, zoomToElement } = viewport;
  const dragMovedRef = useRef(false);
  const dragRafRef = useRef<ScheduledTask | null>(null);
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const zoomedAnimeIdRef = useRef<number | null>(null);
  const focusAfterLayoutRef = useRef(false);
  const positionsRef = useRef(positions);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const focusCurrent = useCallback(() => {
    scheduleTask("raf", 0, () => {
      zoomToElement(`franchise-node-${animeId}`, 1.5, 300);
    });
  }, [animeId, zoomToElement]);

  const { data, isLoading, isFetching, isError, error, refetch } = useAppQuery("static", {
    queryKey: queryKeys.animeFranchiseRefresh(animeId, refreshKey),
    queryFn: () => anilistApi.getAnimeFranchise(animeId, refreshKey ? "fresh" : "all"),
    staleTime: Infinity,
  });

  useEffect(() => {
    setSearchQuery("");
    setResetKey((key) => key + 1);
    setExpandedGroups(new Set());
    zoomedAnimeIdRef.current = null;
  }, [animeId]);

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

  const animeNodes = useMemo(
    () =>
      data
        ? data.nodes.filter(
            (node) =>
              node.id === data.root_id || node.media_type === "ANIME" || node.media_type == null
          )
        : [],
    [data]
  );

  const fullRelationMap = useMemo(
    () =>
      data
        ? computeNodeRelationMap(data, new Map(animeNodes.map((node) => [node.id, node])))
        : new Map<number, string>(),
    [data, animeNodes]
  );

  const groupCounts = useMemo(
    () => countFranchiseGroups(animeNodes, fullRelationMap, data?.root_id ?? 0),
    [animeNodes, fullRelationMap, data]
  );

  const listMatchIds = useMemo(
    () => (filtered ? filterFranchiseNodesBySearch(filtered.nodeMap, searchQuery) : null),
    [searchQuery, filtered]
  );

  const graphMatchIds = useMemo(() => {
    const matches = collapsed
      ? filterFranchiseNodesBySearch(collapsed.graph.nodeMap, searchQuery)
      : null;
    if (!matches || !collapsed || collapsed.aggregators.size === 0) return matches;
    const lower = searchQuery.toLowerCase().trim();
    for (const [aggId, info] of collapsed.aggregators) {
      if (matches.has(aggId)) continue;
      for (const node of filtered?.nodeMap.values() ?? []) {
        if (relationGroup(relationMap.get(node.id) ?? "UNKNOWN") !== info.group) continue;
        if (node.title.toLowerCase().includes(lower)) {
          matches.add(aggId);
          break;
        }
      }
    }
    return matches;
  }, [collapsed, filtered, relationMap, searchQuery]);

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
    focusAfterLayoutRef.current = true;
    setResetKey((k) => k + 1);
  }, []);

  const handleToggleView = useCallback(() => {
    if (listView) focusAfterLayoutRef.current = true;
    setListView((value) => !value);
  }, [listView]);

  const totalNodes = collapsed?.graph.nodeMap.size ?? 0;
  const dims = useMemo(() => computeNodeDimensions(totalNodes), [totalNodes]);
  const { totalH, displayH } = useMemo(() => computeGraphMetrics(totalNodes), [totalNodes]);

  useEffect(() => {
    if (!expanded || listView) return;
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
  }, [
    collapsed,
    animeId,
    containerWidth,
    totalH,
    dims,
    resetKey,
    relationMap,
    mainlineIds,
    expanded,
    listView,
  ]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scale = getScale();
      const dx = (e.clientX - dragging.startMouseX) / scale;
      const dy = (e.clientY - dragging.startMouseY) / scale;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMovedRef.current = true;
      dragPointRef.current = { x: dragging.startNodeX + dx, y: dragging.startNodeY + dy };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = scheduleTask("raf", 0, () => {
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
      dragRafRef.current?.cancel();
      dragRafRef.current = null;
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
    if (!expanded || listView || positions.size === 0) return;
    if (!collapsed?.graph.nodeMap.has(animeId)) return;
    if (zoomedAnimeIdRef.current === animeId) return;
    zoomedAnimeIdRef.current = animeId;
    focusCurrent();
  }, [expanded, listView, positions, collapsed, animeId, focusCurrent]);

  useEffect(() => {
    if (listView || positions.size === 0) return;
    if (!collapsed?.graph.nodeMap.has(animeId)) return;
    if (!focusAfterLayoutRef.current) return;
    focusAfterLayoutRef.current = false;
    focusCurrent();
  }, [listView, positions, collapsed, animeId, focusCurrent]);

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
      <div className="flex items-center justify-center" style={{ height: LOADING_HEIGHT }}>
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
  const matchCount = (listView ? listMatchIds : graphMatchIds)?.size ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <FranchiseToolbar
        activeFilters={activeFilters}
        groupCounts={groupCounts}
        searchQuery={searchQuery}
        matchCount={matchCount}
        listView={listView}
        refreshing={isFetching}
        onToggleFilter={toggleFilter}
        onSearchChange={setSearchQuery}
        onToggleView={handleToggleView}
        onFocusCurrent={focusCurrent}
        onResetLayout={resetSimulation}
        onRefresh={() =>
          setRefresh((prev) => ({
            id: animeId,
            key: prev.id === animeId ? prev.key + 1 : 1,
          }))
        }
      />

      <section
        ref={containerRef}
        className="windows95-border bg-field relative overflow-hidden"
        style={{ height: displayH }}
      >
        {listView
          ? filtered && (
              <FranchiseList
                nodes={[...filtered.nodeMap.values()]}
                edges={filtered.edges}
                animeId={animeId}
                entryLookup={entryLookup}
                relationMap={relationMap}
                mainlineIds={mainlineIds}
                searchMatchIds={listMatchIds}
                scoreFormat={scoreFormat}
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
                searchMatchIds={graphMatchIds}
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
