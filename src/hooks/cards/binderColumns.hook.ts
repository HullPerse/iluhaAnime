import { useEffect, useRef, useState, type RefObject } from "react";

const MIN_COLUMNS = 4;
const MAX_COLUMNS = 6;
const MIN_CARD_WIDTH = 108;
const GAP = 8;

export function useBinderColumns(
  externalRef?: RefObject<HTMLDivElement | null>,
  ready = true
) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const ref = externalRef ?? ownRef;
  const [columns, setColumns] = useState(MIN_COLUMNS);

  useEffect(() => {
    if (!ready) return;
    const element = ref.current;
    if (element === null) return;
    const update = () => {
      const width = element.clientWidth;
      if (width <= 0) return;
      const next = Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP));
      setColumns(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, next)));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, ready]);

  return { ref, columns };
}
