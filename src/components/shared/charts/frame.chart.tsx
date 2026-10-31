import { cn } from "cn";
import { useEffect, useId, useRef, useState } from "react";
import type { ChartFrameProps, ChartMargin, ChartPlot } from "@/types/core/frame.chart";

const DEFAULT_MARGIN: ChartMargin = { top: 4, right: 4, bottom: 4, left: 4 };

export function ChartFrame({
  height,
  ariaLabel,
  description,
  announcement,
  margin,
  interactive = false,
  className,
  onKeyDown,
  onFocus,
  onBlur,
  children,
}: ChartFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(0);
  const descriptionId = useId();

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const resolved: ChartMargin = { ...DEFAULT_MARGIN, ...margin };
  const plot: ChartPlot = {
    left: resolved.left,
    top: resolved.top,
    width: Math.max(0, width - resolved.left - resolved.right),
    height: Math.max(0, height - resolved.top - resolved.bottom),
  };

  return (
    <div
      ref={containerRef}
      role={interactive ? "application" : "img"}
      aria-label={ariaLabel}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "relative w-full outline-none select-none",
        interactive &&
          "focus-visible:outline-text focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-dotted",
        className
      )}
      style={{ height }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true" focusable="false" className="block">
          <rect
            x={plot.left}
            y={plot.top}
            width={plot.width}
            height={plot.height}
            fill="var(--color-field)"
            stroke="var(--color-win-shadow)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          {children(plot, width)}
        </svg>
      )}
      {description && (
        <p id={descriptionId} className="sr-only">
          {description}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement ?? ""}
      </p>
    </div>
  );
}
