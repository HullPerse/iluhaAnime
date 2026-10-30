import { CHART_TICK_FONT_SIZE, CHART_TICK_TEXT_CLASS } from "@/config/graphics/chartTicks.config";
import { truncateLabel } from "@/lib/graphics/chartTicks.utils";
import type { ChartPlot } from "@/types/core/frame.chart";
import type { TickEntry } from "@/types/core/ticks.chart";

export function BandAxisLabels({
  plot,
  entries,
  side = "left",
  maxChars = 18,
}: {
  plot: ChartPlot;
  entries: readonly TickEntry[];
  side?: "left" | "bottom";
  maxChars?: number;
}) {
  return (
    <>
      {entries.map((entry) => {
        const label = truncateLabel(entry.label, maxChars);
        if (side === "left") {
          return (
            <text
              key={`left:${entry.position}:${entry.label}`}
              x={plot.left - 6}
              y={entry.position + 3}
              textAnchor="end"
              className={CHART_TICK_TEXT_CLASS}
              fontSize={CHART_TICK_FONT_SIZE}
            >
              {label}
            </text>
          );
        }
        return (
          <text
            key={`bottom:${entry.position}:${entry.label}`}
            x={entry.position}
            y={plot.top + plot.height + 12}
            textAnchor="middle"
            className={CHART_TICK_TEXT_CLASS}
            fontSize={CHART_TICK_FONT_SIZE}
          >
            {label}
          </text>
        );
      })}
    </>
  );
}
