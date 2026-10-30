import { CHART_TICK_FONT_SIZE, CHART_TICK_TEXT_CLASS } from "@/config/graphics/chartTicks.config";
import type { ChartPlot } from "@/types/core/frame.chart";
import type { TickEntry } from "@/types/core/ticks.chart";

export function ValueAxisLabels({
  plot,
  entries,
  side = "left",
}: {
  plot: ChartPlot;
  entries: readonly TickEntry[];
  side?: "left" | "right" | "bottom";
}) {
  return (
    <>
      {entries.map((entry) => {
        const key = `${side}:${entry.position}:${entry.label}`;
        const common = { className: CHART_TICK_TEXT_CLASS, fontSize: CHART_TICK_FONT_SIZE };
        if (side === "left") {
          return (
            <text key={key} {...common} x={plot.left - 4} y={entry.position + 3} textAnchor="end">
              {entry.label}
            </text>
          );
        }
        if (side === "right") {
          return (
            <text
              key={key}
              {...common}
              x={plot.left + plot.width + 4}
              y={entry.position + 3}
              textAnchor="start"
            >
              {entry.label}
            </text>
          );
        }
        return (
          <text
            key={key}
            {...common}
            x={entry.position}
            y={plot.top + plot.height + 12}
            textAnchor="middle"
          >
            {entry.label}
          </text>
        );
      })}
    </>
  );
}
