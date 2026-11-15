import { useEffect, useState } from "react";
import type { RefObject } from "react";

import {
  CARD_GRID_FALLBACK_COLUMNS,
  CARD_GRID_FALLBACK_ROW_HEIGHT,
  CARD_GRID_GAP,
  CARD_GRID_HORIZONTAL_PADDING,
  CARD_GRID_LARGE_WIDTH,
  CARD_GRID_SMALL_WIDTH,
} from "@/config/cards/grid.config";

export function useGridMetrics(scrollRef: RefObject<HTMLDivElement | null>) {
  const [metrics, setMetrics] = useState({
    columns: CARD_GRID_FALLBACK_COLUMNS,
    rowHeight: CARD_GRID_FALLBACK_ROW_HEIGHT,
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const update = () => {
      const width = element.clientWidth - CARD_GRID_HORIZONTAL_PADDING;
      if (width <= 0) return;
      const minCardWidth = width >= 640 ? CARD_GRID_LARGE_WIDTH : CARD_GRID_SMALL_WIDTH;
      const columns = Math.max(
        1,
        Math.floor((width + CARD_GRID_GAP) / (minCardWidth + CARD_GRID_GAP))
      );
      const cardWidth = (width - CARD_GRID_GAP * (columns - 1)) / columns;
      const rowHeight = cardWidth * 1.5 + CARD_GRID_GAP;
      setMetrics((current) =>
        current.columns === columns && Math.abs(current.rowHeight - rowHeight) < 1
          ? current
          : { columns, rowHeight }
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef]);

  return metrics;
}
