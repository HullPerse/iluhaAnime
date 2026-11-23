import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { ReaderPage } from "@/routes/components/manga/reader/page.reader";

export function Strip({
  current,
  initialOffset,
  jump,
  count,
  manifest,
  gap,
  onPage,
  onLoad,
}: {
  current: number;
  initialOffset: number;
  jump: { index: number; token: number };
  count: number;
  manifest: string;
  gap: number;
  onPage: (page: number, offset: number) => void;
  onLoad: (page: number) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const start = useRef<{ index: number; offset: number }>({
    index: current,
    offset: initialOffset,
  });
  const list = useVirtualizer({
    count,
    getScrollElement: () => scroll.current,
    estimateSize: () => 800,
    gap,
    overscan: 2,
    onChange: (instance, scrolling) => {
      if (!scrolling) return;
      const offset = instance.scrollOffset ?? 0;
      const height = instance.scrollRect?.height ?? 0;

      if (offset + height >= instance.getTotalSize() - 2) {
        onPage(count - 1, 0);

        return;
      }

      const item = instance.getVirtualItemForOffset(offset + 4);

      if (item) onPage(item.index, Math.max(0, offset - item.start));
    },
  });

  list.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    const offset = instance.scrollOffset ?? 0;

    return item.size > 0 && item.start + item.size <= offset;
  };

  useEffect(() => {
    const { index, offset } = start.current;

    list.scrollToIndex(index);

    if (offset > 0) list.scrollBy(offset);
  }, [list]);
  useEffect(() => {
    if (!jump.token) return;
    const frame = requestAnimationFrame(() => {
      list.scrollToIndex(jump.index, { align: "start" });
    });

    return () => cancelAnimationFrame(frame);
  }, [jump.index, jump.token, list]);

  return (
    <div
      ref={scroll}
      data-manga-strip
      data-reader-scroll
      style={{ scrollBehavior: "auto" }}
      className="absolute inset-0 overflow-y-auto"
    >
      <div className="relative" style={{ blockSize: list.getTotalSize() }}>
        {list.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={list.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <ReaderPage
              manifest={manifest}
              page={item.index}
              strip
              first={item.index === 0}
              last={item.index === count - 1}
              onLoad={onLoad}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
