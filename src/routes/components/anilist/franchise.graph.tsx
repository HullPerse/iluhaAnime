import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { EDGE_STYLES } from "@/config/anilist.config";
import { FranNode } from "./graph.node";
import type { FilteredGraph, FranchiseNodePosition } from "@/types/anilist";

interface FranchiseGraphProps {
  filtered: FilteredGraph;
  animeId: number;
  containerWidth: number;
  totalHeight: number;
  dims: { w: number; h: number; imgH: number };
  positions: Map<number, FranchiseNodePosition>;
  relationMap: Map<number, string>;
  searchMatchIds: Set<number> | null;
  transformRef: React.RefObject<ReactZoomPanPinchRef | null>;
  onNodeClick: (nodeId: number) => void;
  onNodeMouseDown: (event: React.MouseEvent, nodeId: number) => void;
}

function FranchiseGraph({
  filtered,
  animeId,
  containerWidth,
  totalHeight,
  dims,
  positions,
  relationMap,
  searchMatchIds,
  transformRef,
  onNodeClick,
  onNodeMouseDown,
}: FranchiseGraphProps) {
  return (
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
            height: totalHeight,
            position: "relative",
          }}
        >
          <svg
            width={containerWidth}
            height={totalHeight}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            {filtered.edges.map((edge, index) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              if (!source || !target) return null;
              const style = EDGE_STYLES[edge.relation_type] ?? {
                color: "#bdc3c7",
                dash: "2,2",
                width: 0.75,
              };

              return (
                <line
                  key={`${edge.source}-${edge.target}-${edge.relation_type}-${index}`}
                  x1={source.x + dims.w / 2}
                  y1={source.y + dims.imgH / 2}
                  x2={target.x + dims.w / 2}
                  y2={target.y + dims.imgH / 2}
                  stroke={style.color}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                />
              );
            })}
          </svg>
          {[...filtered.nodeMap.values()].map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            const dimmed =
              searchMatchIds !== null && !searchMatchIds.has(node.id);
            return (
              <FranNode
                key={node.id}
                node={node}
                x={position.x}
                y={position.y}
                isRoot={node.id === animeId}
                onRelated={onNodeClick}
                onMouseDown={onNodeMouseDown}
                id={`franchise-node-${node.id}`}
                dimmed={dimmed}
                dims={dims}
                relationType={relationMap.get(node.id)}
              />
            );
          })}
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}

export { FranchiseGraph };
