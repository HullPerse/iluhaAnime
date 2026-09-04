import { useEffect, useState, type RefObject } from "react";

import { CARD_W } from "@/config/collection.config";

export interface GridLayout {
  columns: number;
  columnWidth: number;
}

export function useGridColumns(
  parentRef: RefObject<HTMLDivElement | null>,
  minCardWidth = CARD_W,
  gap = 8
): GridLayout {
  const [layout, setLayout] = useState<GridLayout>({ columns: 4, columnWidth: minCardWidth });

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const calc = (width: number): GridLayout => {
      const columns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
      return { columns, columnWidth: (width - gap * (columns - 1)) / columns };
    };
    const update = (width: number) => {
      if (!width) return;
      const next = calc(width);
      setLayout((prev) =>
        prev.columns === next.columns && prev.columnWidth === next.columnWidth ? prev : next
      );
    };
    update(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [parentRef, minCardWidth, gap]);

  return layout;
}
