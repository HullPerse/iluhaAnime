import { useEffect, useRef, useState, type RefObject } from "react";

import { STATUS_TAB_WIDTH } from "@/config/collection/statuses.config";

export function usePagedRow(
  count: number,
  activeIndex: number
): {
  rowRef: RefObject<HTMLDivElement | null>;
  start: number;
  end: number;
  stepPage: (direction: 1 | -1) => void;
} {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [perPage, setPerPage] = useState(4);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(count / perPage));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const update = () =>
      setPerPage(Math.max(1, Math.floor((el.clientWidth + 4) / (STATUS_TAB_WIDTH + 4))));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPage(Math.floor(Math.max(0, activeIndex) / perPage));
  }, [activeIndex, perPage]);

  return {
    rowRef,
    start: safePage * perPage,
    end: safePage * perPage + perPage,
    stepPage: (direction) => {
      setPage((safePage + direction + pageCount) % pageCount);
    },
  };
}
