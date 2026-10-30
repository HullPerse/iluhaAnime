import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { HEADER_ESTIMATE, ROW_ESTIMATE } from "@/config/anilist/card.config";
import { useI18n } from "@/hooks/i18n.hook";
import { statusLabel } from "@/lib/core/status.utils";
import { useCell } from "@/lib/core/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import type {
  CollectionGroup,
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  GroupedRow,
} from "@/types/anilist/collection";

import { publicHeaderProps } from "@/lib/collection/statusHeader.utils";
import { GroupHeaderCollection } from "@/routes/components/collection/groupHeader.collection";
import { CollectionRow } from "@/routes/components/collection/row.collection";

export default function ListCollection({
  items,
  statuses,
  selectedId,
  onOpen,
  onSetStatus,
  groups,
  collapsedStatuses,
  onToggleStatusCollapsed,
  onAddToStatus,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  selectedId?: string | null;
  onOpen?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
  groups?: CollectionGroup[];
  collapsedStatuses?: Set<string>;
  onToggleStatusCollapsed?: (statusId: string) => void;
  onAddToStatus?: (status: CollectionStatusDef) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { t, locale } = useI18n();
  const headerVariant = useCell(settingsAtoms.collectionGroupHeaderStyle);
  const rows = useMemo<GroupedRow[] | null>(() => {
    if (!groups?.length) return null;
    const out: GroupedRow[] = [];
    for (const group of groups) {
      out.push({ kind: "header", status: group.status });
      if (collapsedStatuses?.has(group.status.id)) continue;
      for (const item of group.items) out.push({ kind: "item", item });
    }
    return out;
  }, [groups, collapsedStatuses]);
  const grouped = rows !== null;
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groups ?? []) map.set(group.status.id, group.items.length);
    return map;
  }, [groups]);

  const rowVirtualizer = useVirtualizer({
    count: rows?.length ?? items.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      if (!grouped) return items[index]?.id ?? index;
      const row = rows?.[index];
      if (!row) return index;
      return row.kind === "header" ? `header-${row.status.id}` : row.item.id;
    },
    estimateSize: (index) => {
      if (!grouped) return ROW_ESTIMATE;
      return rows?.[index]?.kind === "header" ? HEADER_ESTIMATE : ROW_ESTIMATE;
    },
    overscan: 4,
  });

  return (
    <section
      ref={parentRef}
      data-scroll-root
      data-virtual-list
      className="windows95-border bg-field flex min-h-0 w-full flex-1 scrollbar-gutter-stable flex-col gap-1 overflow-y-auto border p-1"
    >
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = grouped ? (rows?.[virtualRow.index] ?? null) : null;
          if (grouped && !row) return null;
          const isHeader = row?.kind === "header";
          let item: CollectionItem | null = null;
          if (!grouped) {
            item = items[virtualRow.index] ?? null;
          } else if (row?.kind === "item") {
            item = row.item;
          }
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={(el) => {
                if (el) rowVirtualizer.measureElement(el);
              }}
              className="absolute top-0 left-0 w-full pb-1"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {isHeader && row ? (
                <GroupHeaderCollection
                  label={statusLabel([row.status], row.status.id, t, locale)}
                  color={row.status.color}
                  count={groupCounts.get(row.status.id) ?? 0}
                  collapsed={Boolean(collapsedStatuses?.has(row.status.id))}
                  variant={headerVariant}
                  toggleLabel={t("collection.group.toggle")}
                  onToggle={() => onToggleStatusCollapsed?.(row.status.id)}
                  {...publicHeaderProps({
                    status: row.status,
                    count: groupCounts.get(row.status.id) ?? 0,
                    addLabel: t("collection.add.media"),
                    onAddToStatus,
                  })}
                />
              ) : item ? (
                <CollectionRow
                  item={item}
                  statuses={statuses}
                  selected={selectedId != null && item.id === selectedId}
                  onOpen={onOpen}
                  onSetStatus={onSetStatus}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
