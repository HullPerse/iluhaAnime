import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import { CARD_POSTER_H, CARD_W } from "@/config/collection.config";
import { useGridColumns } from "@/hooks/gridColumns.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { paginate } from "@/lib/pagination.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  CollectionStore,
} from "@/types/collection";

import { CollectionCard } from "./card.collection";

const ROW_GAP = 8;
// Title block (h-10) + status bar (h-7) below the poster.
const CARD_TEXT_H = 68;

interface GridCollectionProps {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  display: CollectionStore["displayMode"];
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}

function GridRow({
  rowItems,
  columns,
  statuses,
  onOpen,
  onEdit,
  onSetStatus,
}: {
  rowItems: CollectionItem[];
  columns: number;
  statuses: CollectionStatusDef[];
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  return (
    <div className="flex w-full gap-2">
      {rowItems.map((item) => (
        <div key={item.id} className="min-w-0 flex-1">
          <CollectionCard
            item={item}
            statuses={statuses}
            onOpen={onOpen}
            onEdit={onEdit}
            onSetStatus={onSetStatus}
          />
        </div>
      ))}
      {rowItems.length < columns &&
        Array.from({ length: columns - rowItems.length }, (_, fill) => (
          <div key={`fill-${fill}`} aria-hidden className="min-w-0 flex-1" />
        ))}
    </div>
  );
}

function GridScrollView({
  items,
  statuses,
  onOpen,
  onEdit,
  onSetStatus,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { columns, columnWidth } = useGridColumns(parentRef, CARD_W, ROW_GAP);
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => items[index * columns]?.id ?? index,
    estimateSize: () => (columnWidth * CARD_POSTER_H) / CARD_W + CARD_TEXT_H + ROW_GAP,
    overscan: 2,
  });

  return (
    <section
      ref={parentRef}
      className="windows95-border min-h-0 w-full flex-1 [scrollbar-gutter:stable] overflow-y-auto border bg-white p-1"
    >
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={(el) => {
              if (el) rowVirtualizer.measureElement(el);
            }}
            className="absolute top-0 left-0 w-full pb-2"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <GridRow
              rowItems={items.slice(
                virtualRow.index * columns,
                virtualRow.index * columns + columns
              )}
              columns={columns}
              statuses={statuses}
              onOpen={onOpen}
              onEdit={onEdit}
              onSetStatus={onSetStatus}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function GridPagedView({
  items,
  statuses,
  onOpen,
  onEdit,
  onSetStatus,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  const pageSize = useSettingsStore((s) => s.pageSize);
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLElement>(null);
  const { total, from, to, lastPage } = usePagination(items.length, pageSize, page, setPage);
  const visible = useMemo(() => paginate(items, page, pageSize), [items, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, []);
  useEffect(() => {
    setPage((current) => Math.min(current, lastPage));
  }, [lastPage]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-hidden">
      <section
        ref={scrollRef}
        className="windows95-border min-h-0 w-full flex-1 [scrollbar-gutter:stable] overflow-y-auto border bg-white p-1"
      >
        <div
          className="grid content-start gap-2"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_W}px, 1fr))` }}
        >
          {visible.map((item) => (
            <CollectionCard
              key={item.id}
              item={item}
              statuses={statuses}
              onOpen={onOpen}
              onEdit={onEdit}
              onSetStatus={onSetStatus}
            />
          ))}
        </div>
      </section>
      {total > 0 && (
        <Pagination
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          scrollRef={scrollRef}
        />
      )}
    </div>
  );
}

export default function GridCollection({
  items,
  statuses,
  display,
  onOpen,
  onEdit,
  onSetStatus,
}: GridCollectionProps) {
  if (display === "pagination")
    return (
      <GridPagedView
        items={items}
        statuses={statuses}
        onOpen={onOpen}
        onEdit={onEdit}
        onSetStatus={onSetStatus}
      />
    );
  return (
    <GridScrollView
      items={items}
      statuses={statuses}
      onOpen={onOpen}
      onEdit={onEdit}
      onSetStatus={onSetStatus}
    />
  );
}
