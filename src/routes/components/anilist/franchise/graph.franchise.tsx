import { EDGE_STYLES } from "@/config/anilist/graph.config";
import type { FranchiseGraphProps } from "@/types/anilist";

import { FranNode } from "./node.franchise";

function FranchiseGraph({
  filtered,
  animeId,
  containerWidth,
  totalHeight,
  dims,
  positions,
  relationMap,
  searchMatchIds,
  viewport,
  onNodeClick,
  onNodeMouseDown,
}: FranchiseGraphProps) {
  return (
    <div className="h-full w-full" {...viewport.wrapperProps}>
      <div
        style={{
          ...viewport.transformStyle,
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
          const dimmed = searchMatchIds !== null && !searchMatchIds.has(node.id);
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
    </div>
  );
}

export { FranchiseGraph };
