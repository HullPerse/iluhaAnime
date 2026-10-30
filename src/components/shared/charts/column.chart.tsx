import { CHART_LAYOUT } from "@/config/palette.config";
import { useChartCursor } from "@/hooks/chartCursor.hook";
import { nearestIndex } from "@/lib/geometry.utils";
import { bandScale, niceMax, niceTicks } from "@/lib/scale.utils";
import { clamp } from "@/lib/math.utils";

import { ChartFrame } from "./frame.chart";
import { BandAxisLabels, ChartGrid, ValueAxisLabels } from "./ticks.chart";
import { SvgChartTooltip, tooltipAnnouncement } from "./tooltip.chart";
import type { ColumnChartProps } from "@/types/column.chart";

export function ColumnChart({
  data,
  ariaLabel,
  description,
  formatValue,
  axisFormat = formatValue,
  tooltip,
  activeText,
  onActivate,
  height = 180,
  gap = 2,
  reference,
  band,
  xDomain,
  emptyLabel,
}: ColumnChartProps) {
  const cursor = useChartCursor(data.length, onActivate);
  const maxValue = data.reduce((value, datum) => Math.max(value, datum.value), 0);
  const top = Math.max(1, niceMax(maxValue, 4));
  const ticks = niceTicks(0, top, 4);
  const activeDatum = cursor.active == null ? null : data[cursor.active];
  const tooltipData =
    activeDatum && cursor.active != null ? tooltip?.(activeDatum, cursor.active) : undefined;
  const announcement =
    activeDatum && cursor.active != null
      ? (activeText?.(activeDatum, cursor.active) ??
        (tooltipData ? tooltipAnnouncement(tooltipData) : activeDatum.label))
      : null;

  if (data.length === 0) {
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className="windows95-border bg-field text-hint windows95-font flex items-center justify-center text-xs"
        style={{ height }}
      >
        {emptyLabel ?? ""}
      </div>
    );
  }

  const domain = xDomain ?? ([0, data.length] as const);
  const domainSpan = domain[1] - domain[0];
  const xFor = (value: number) =>
    domainSpan > 0 ? clamp((value - domain[0]) / domainSpan, 0, 1) : 0;

  return (
    <ChartFrame
      height={height}
      ariaLabel={ariaLabel}
      description={description}
      announcement={announcement}
      interactive
      margin={{
        left: CHART_LAYOUT.valueAxisGutter,
        right: 6,
        top: 10,
        bottom: CHART_LAYOUT.bottomAxisGutter,
      }}
      onKeyDown={cursor.handleKeyDown}
      onFocus={cursor.handleFocus}
      onBlur={cursor.handleBlur}
    >
      {(plot) => {
        const bands = bandScale(data.length, plot.width, gap);
        const centers = data.map((_, index) => plot.left + bands.center(index));
        const hitCenters = data.map((_, index) => bands.center(index));
        const valueY = (value: number) => plot.top + plot.height - (plot.height * value) / top;
        const tickStep = Math.max(
          1,
          Math.ceil(data.length / Math.max(1, Math.floor(plot.width / 40)))
        );
        const labelEntries = data
          .map((datum, index) => ({ position: centers[index]!, label: datum.label, index }))
          .filter((entry) => entry.index % tickStep === 0 || entry.index === data.length - 1);
        const activeCenter = cursor.active == null ? 0 : centers[cursor.active]!;
        const activeTop = activeDatum == null ? 0 : valueY(activeDatum.value);
        return (
          <>
            <ChartGrid
              plot={plot}
              positions={ticks.map((tick) => valueY(tick))}
              orientation="horizontal"
            />
            <ValueAxisLabels
              plot={plot}
              entries={ticks.map((tick) => ({ position: valueY(tick), label: axisFormat(tick) }))}
              side="left"
            />
            {band && domainSpan > 0 ? (
              <rect
                x={plot.left + xFor(band.from) * plot.width}
                y={plot.top}
                width={Math.max(1, (xFor(band.to) - xFor(band.from)) * plot.width)}
                height={plot.height}
                fill="var(--color-secondary)"
                fillOpacity={0.1}
              />
            ) : null}
            {data.map((datum, index) => {
              const barWidth = Math.max(1, bands.bandwidth);
              const barHeight = (plot.height * datum.value) / top;
              const isActive = cursor.active === index;
              return (
                <rect
                  key={datum.key}
                  x={plot.left + bands.position(index)}
                  y={plot.top + plot.height - barHeight}
                  width={barWidth}
                  height={Math.max(0, barHeight)}
                  fill="var(--color-secondary)"
                  stroke={isActive ? "var(--color-highlight)" : "var(--color-win-shadow)"}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              );
            })}
            {reference && domainSpan > 0 ? (
              <g>
                <line
                  x1={plot.left + xFor(reference.value) * plot.width}
                  x2={plot.left + xFor(reference.value) * plot.width}
                  y1={plot.top}
                  y2={plot.top + plot.height}
                  stroke="var(--color-highlight)"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
                {reference.label ? (
                  <text
                    x={plot.left + xFor(reference.value) * plot.width + 3}
                    y={plot.top + 8}
                    className="windows95-font fill-highlight"
                    fontSize={9}
                  >
                    {reference.label}
                  </text>
                ) : null}
              </g>
            ) : null}
            <BandAxisLabels plot={plot} entries={labelEntries} side="bottom" maxChars={6} />
            {tooltipData && activeDatum ? (
              <SvgChartTooltip
                x={activeCenter}
                y={activeTop < 44 ? activeTop + 12 : activeTop}
                data={tooltipData}
                plot={plot}
                placement={activeTop < 44 ? "below" : "above"}
              />
            ) : null}
            <rect
              x={plot.left}
              y={plot.top}
              width={plot.width}
              height={plot.height}
              fill="transparent"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - rect.left;
                cursor.setActive(nearestIndex(hitCenters, x));
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
