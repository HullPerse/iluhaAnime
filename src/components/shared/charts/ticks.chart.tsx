import type { ChartPlot } from "@/types/frame.chart";
import type { TickEntry } from "@/types/ticks.chart";

const TEXT_CLASS = "windows95-font fill-text";
const TICK_FONT_SIZE = 10;

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
        const common = { className: TEXT_CLASS, fontSize: TICK_FONT_SIZE };
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

export function truncateLabel(label: string, maxChars: number): string {
  if (maxChars <= 3) return label.slice(0, Math.max(0, maxChars));
  if (label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 3)}...`;
}

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
              className={TEXT_CLASS}
              fontSize={TICK_FONT_SIZE}
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
            className={TEXT_CLASS}
            fontSize={TICK_FONT_SIZE}
          >
            {label}
          </text>
        );
      })}
    </>
  );
}
