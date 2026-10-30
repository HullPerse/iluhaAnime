import { CHART_LAYOUT } from "@/config/graphics/palette.config";
import { tooltipHeight } from "@/lib/graphics/chartTooltip.utils";
import { clamp } from "@/lib/core/math.utils";

import type { ChartPlot } from "@/types/core/frame.chart";
import type { ChartTooltipData } from "@/types/core/tooltip.chart";

export function SvgChartTooltip({
  x,
  y,
  data,
  plot,
  placement = "above",
}: {
  x: number;
  y: number;
  data: ChartTooltipData;
  plot: ChartPlot;
  placement?: "above" | "below";
}) {
  const width = CHART_LAYOUT.tooltipWidth;
  const height = tooltipHeight(data);
  const left =
    plot.width <= width
      ? plot.left
      : clamp(x - width / 2, plot.left, plot.left + plot.width - width);
  const top = placement === "above" ? y - height - 4 : y + 4;

  return (
    <foreignObject x={left} y={top} width={width} height={height}>
      <div
        aria-hidden="true"
        className="windows95-active-border bg-primary text-text windows95-font w-full p-1 text-xs leading-tight"
        style={{ boxShadow: "1px 1px 0 var(--color-win-shadow)" }}
      >
        <div className="truncate font-bold">{data.title}</div>
        {data.rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <span className="text-hint truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </foreignObject>
  );
}
