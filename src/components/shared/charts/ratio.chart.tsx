import { RATIO_PALETTE } from "@/config/charts/palette.config";
import { useChartCursor } from "@/hooks/chartCursor.hook";
import { ratioSegments } from "@/lib/charts/geometry.utils";
import { clamp } from "@/lib/utils/math.utils";

import { ChartFrame } from "./frame.chart";
import { SvgChartTooltip, tooltipAnnouncement } from "./tooltip.chart";
import type { ChartTooltipData } from "./tooltip.chart";

export interface RatioDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface RatioChartProps {
  data: readonly RatioDatum[];
  ariaLabel: string;
  description?: string;
  formatValue: (value: number) => string;
  tooltip?: (datum: RatioDatum, index: number) => ChartTooltipData;
  activeText?: (datum: RatioDatum, index: number) => string;
  onActivate?: (index: number) => void;
  emptyLabel?: string;
}

const BAR_HEIGHT = 22;

export function RatioChart({
  data,
  ariaLabel,
  description,
  formatValue,
  tooltip,
  activeText,
  onActivate,
  emptyLabel,
}: RatioChartProps) {
  const cursor = useChartCursor(data.length, onActivate);
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
        style={{ height: BAR_HEIGHT }}
      >
        {emptyLabel ?? ""}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <ChartFrame
        height={BAR_HEIGHT}
        ariaLabel={ariaLabel}
        description={description}
        announcement={announcement}
        interactive
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        onKeyDown={cursor.handleKeyDown}
        onFocus={cursor.handleFocus}
        onBlur={cursor.handleBlur}
      >
        {(plot) => {
          const segments = ratioSegments(
            data.map((datum) => datum.value),
            plot.width
          );
          const activeSegment = cursor.active == null ? undefined : segments[cursor.active];
          return (
            <>
              {segments.map((segment, index) => {
                const datum = data[index]!;
                const isActive = cursor.active === index;
                return (
                  <rect
                    key={datum.key}
                    x={plot.left + segment.start}
                    y={plot.top}
                    width={segment.length}
                    height={plot.height}
                    fill={datum.color ?? RATIO_PALETTE[index % RATIO_PALETTE.length]}
                    stroke={isActive ? "var(--color-highlight)" : "var(--color-field)"}
                    strokeWidth={isActive ? 2 : 1}
                    shapeRendering="crispEdges"
                  />
                );
              })}
              {tooltipData && activeDatum && activeSegment ? (
                <SvgChartTooltip
                  x={plot.left + activeSegment.start + activeSegment.length / 2}
                  y={plot.top + plot.height - 2}
                  data={tooltipData}
                  plot={plot}
                  placement="below"
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
                  const x = clamp(event.clientX - rect.left, 0, Math.max(0, plot.width - 1));
                  let index = segments.length - 1;
                  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
                    const segment = segments[segmentIndex]!;
                    if (x < segment.start + segment.length) {
                      index = segmentIndex;
                      break;
                    }
                  }
                  cursor.setActive(index);
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
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {data.map((datum, index) => (
          <span
            key={datum.key}
            className="windows95-font text-text flex min-w-0 items-center gap-1 text-xs"
          >
            <span
              aria-hidden="true"
              className="windows95-border inline-block size-2 shrink-0"
              style={{
                backgroundColor: datum.color ?? RATIO_PALETTE[index % RATIO_PALETTE.length],
              }}
            />
            <span className="truncate">{datum.label}</span>
            <span className="text-hint shrink-0 tabular-nums">{formatValue(datum.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
