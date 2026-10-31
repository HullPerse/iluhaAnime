import { CHART_LAYOUT } from "@/config/graphics/palette.config";
import { useChartCursor } from "@/hooks/chartCursor.hook";
import { barLength } from "@/lib/core/geometry.utils";
import { clamp } from "@/lib/core/math.utils";

import { ChartFrame } from "@/components/shared/charts/frame.chart";
import { BandAxisLabels } from "@/components/shared/charts/ticks/bandAxis.ticks";
import { SvgChartTooltip } from "@/components/shared/charts/tooltip.chart";
import { tooltipAnnouncement } from "@/lib/graphics/chartTooltip.utils";
import type { BarChartProps } from "@/types/core/bar.chart";

export function BarChart({
  data,
  ariaLabel,
  description,
  formatValue,
  tooltip,
  activeText,
  onActivate,
  height,
  emptyLabel,
  labelChars = 16,
}: BarChartProps) {
  const cursor = useChartCursor(data.length, onActivate);
  const rows = data.length;
  const chartHeight = height ?? Math.max(40, rows * CHART_LAYOUT.barRowHeight + 8);
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const activeDatum = cursor.active == null ? null : data[cursor.active];
  const tooltipData =
    activeDatum && cursor.active != null ? tooltip?.(activeDatum, cursor.active) : undefined;
  const announcement =
    activeDatum && cursor.active != null
      ? (activeText?.(activeDatum, cursor.active) ??
        (tooltipData ? tooltipAnnouncement(tooltipData) : activeDatum.label))
      : null;

  if (rows === 0) {
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className="windows95-border bg-field text-hint windows95-font flex items-center justify-center text-xs"
        style={{ height: chartHeight }}
      >
        {emptyLabel ?? ""}
      </div>
    );
  }

  return (
    <ChartFrame
      height={chartHeight}
      ariaLabel={ariaLabel}
      description={description}
      announcement={announcement}
      interactive
      margin={{
        left: CHART_LAYOUT.labelGutter,
        right: CHART_LAYOUT.valueGutter,
        top: 4,
        bottom: 4,
      }}
      onKeyDown={cursor.handleKeyDown}
      onFocus={cursor.handleFocus}
      onBlur={cursor.handleBlur}
    >
      {(plot) => {
        const band = plot.height / rows;
        const barHeight = clamp(band - 4, CHART_LAYOUT.barMinHeight, CHART_LAYOUT.barMaxHeight);
        const centers = data.map((_, index) => plot.top + band * index + band / 2);
        const activeCenter = cursor.active == null ? 0 : centers[cursor.active]!;
        const activeLength =
          activeDatum == null ? 0 : barLength(activeDatum.value, max, plot.width);
        return (
          <>
            {data.map((datum, index) => {
              const center = centers[index]!;
              const length = barLength(datum.value, max, plot.width);
              const isActive = cursor.active === index;
              return (
                <g key={datum.key}>
                  {isActive && (
                    <rect
                      x={plot.left}
                      y={center - band / 2}
                      width={plot.width}
                      height={band}
                      fill="var(--color-secondary)"
                      fillOpacity={0.12}
                    />
                  )}
                  <rect
                    x={plot.left}
                    y={center - barHeight / 2}
                    width={Math.max(1, length)}
                    height={barHeight}
                    fill="var(--color-secondary)"
                    stroke={isActive ? "var(--color-highlight)" : "var(--color-win-shadow)"}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={plot.left + length + 5}
                    y={center + 3}
                    className="windows95-font fill-text tabular-nums"
                    fontSize={10}
                  >
                    {formatValue(datum.value)}
                  </text>
                </g>
              );
            })}
            <BandAxisLabels
              plot={plot}
              entries={data.map((datum, index) => ({
                position: centers[index]!,
                label: datum.label,
              }))}
              side="left"
              maxChars={labelChars}
            />
            {tooltipData && activeDatum && (
              <SvgChartTooltip
                x={plot.left + activeLength + CHART_LAYOUT.tooltipOffset}
                y={
                  cursor.active != null && cursor.active <= 1 ? activeCenter + 10 : activeCenter - 6
                }
                data={tooltipData}
                plot={plot}
                placement={cursor.active != null && cursor.active <= 1 ? "below" : "above"}
              />
            )}
            <rect
              x={plot.left}
              y={plot.top}
              width={plot.width}
              height={plot.height}
              fill="transparent"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const y = event.clientY - rect.top;
                cursor.setActive(clamp(Math.floor(y / band), 0, rows - 1));
              }}
              onPointerLeave={cursor.handlePointerLeave}
              onClick={() => {
                if (cursor.active != null) onActivate?.(cursor.active);
              }}
            />
          </>
        );
      }}
    </ChartFrame>
  );
}
