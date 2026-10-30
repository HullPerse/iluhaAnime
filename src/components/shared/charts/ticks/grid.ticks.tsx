import type { ChartPlot } from "@/types/core/frame.chart";

export function ChartGrid({
  plot,
  positions,
  orientation,
}: {
  plot: ChartPlot;
  positions: readonly number[];
  orientation: "horizontal" | "vertical";
}) {
  return (
    <>
      {positions.map((position) => {
        const key = `${orientation}:${position}`;
        if (orientation === "horizontal") {
          return (
            <line
              key={key}
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={position}
              y2={position}
              stroke="var(--color-muted)"
              strokeOpacity={0.35}
              strokeDasharray="1 2"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          );
        }
        return (
          <line
            key={key}
            x1={position}
            x2={position}
            y1={plot.top}
            y2={plot.top + plot.height}
            stroke="var(--color-muted)"
            strokeOpacity={0.35}
            strokeDasharray="1 2"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        );
      })}
    </>
  );
}
