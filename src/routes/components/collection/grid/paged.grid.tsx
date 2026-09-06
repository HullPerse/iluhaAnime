import { useEffect, useMemo, useRef, useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import { CARD_W } from "@/config/collection/card.config";
import { usePagination } from "@/hooks/pagination.hook";
import { paginate } from "@/lib/utils/pagination.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CollectionStatus, CollectionStatusDef } from "@/types/collection";

import { CollectionCard } from "../card.collection";

export function GridPagedView({
  items,
  statuses,
  selectedId,
  onOpen,
  onEdit,
  onSetStatus,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  selectedId?: string | null;
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
              selected={selectedId != null && item.id === selectedId}
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
