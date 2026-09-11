import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import {
  CARD_POSTER_H,
  CARD_TEXT_H,
  CARD_W,
  HEADER_ESTIMATE,
  ROW_GAP,
} from "@/config/collection/card.config";
import { useGridColumns } from "@/hooks/collection/columns.hook";
import { buildRows } from "@/lib/collection/grid.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  CollectionGroup,
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
} from "@/types/collection";

import { GroupHeaderCollection } from "../groupHeader.collection";
import { GridRow } from "./row.grid";

export function GridScrollView({
  items,
  statuses,
  selectedId,
  onOpen,
  onEdit,
  onSetStatus,
  groups,
  collapsedStatuses,
  onToggleStatusCollapsed,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  selectedId?: string | null;
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
  groups?: CollectionGroup[];
  collapsedStatuses?: Set<string>;
  onToggleStatusCollapsed?: (statusId: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { columns, columnWidth } = useGridColumns(parentRef, CARD_W, ROW_GAP);
  const headerVariant = useSettingsStore((s) => s.collectionGroupHeaderStyle);
  const rows = useMemo(
    () => (groups?.length ? buildRows(groups, columns, collapsedStatuses) : null),
    [groups, columns, collapsedStatuses]
  );
  const grouped = rows !== null;
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groups ?? []) map.set(group.status.id, group.items.length);
    return map;
  }, [groups]);
  const cardHeight = (columnWidth * CARD_POSTER_H) / CARD_W + CARD_TEXT_H + ROW_GAP;
  const rowVirtualizer = useVirtualizer({
    count: rows?.length ?? Math.ceil(items.length / columns),
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      if (!grouped) return items[index * columns]?.id ?? index;
      const row = rows?.[index];
      if (!row) return index;
      return row.kind === "header" ? `header-${row.status.id}` : (row.items[0]?.id ?? index);
    },
    estimateSize: (index) => {
      if (!grouped) return cardHeight;
      return rows?.[index]?.kind === "header" ? HEADER_ESTIMATE : cardHeight;
    },
    overscan: 2,
  });

  return (
    <section
      ref={parentRef}
      className="windows95-border min-h-0 w-full flex-1 [scrollbar-gutter:stable] overflow-y-auto border bg-white p-1"
    >
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = grouped ? (rows?.[virtualRow.index] ?? null) : null;
          if (grouped && !row) return null;
          const isHeader = row?.kind === "header";
          let rowItems: CollectionItem[];
          if (!grouped) {
            rowItems = items.slice(
              virtualRow.index * columns,
              virtualRow.index * columns + columns
            );
          } else if (row?.kind === "header") {
            rowItems = [];
          } else {
            rowItems = row?.items ?? [];
          }
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={(el) => {
                if (el) rowVirtualizer.measureElement(el);
              }}
              className="absolute top-0 left-0 w-full pb-2"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {isHeader && row ? (
                <GroupHeaderCollection
                  status={row.status}
                  count={groupCounts.get(row.status.id) ?? 0}
                  collapsed={Boolean(collapsedStatuses?.has(row.status.id))}
                  variant={headerVariant}
                  onToggle={() => onToggleStatusCollapsed?.(row.status.id)}
                />
              ) : (
                <GridRow
                  rowItems={rowItems}
                  columns={columns}
                  statuses={statuses}
                  selectedId={selectedId}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onSetStatus={onSetStatus}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
