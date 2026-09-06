import { useVirtualizer } from "@tanstack/react-virtual";
import { Edit2, Star } from "lucide-react";
import { memo, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { HEADER_ESTIMATE, ROW_ESTIMATE } from "@/config/collection/card.config";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import { statusColorOf, statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  CollectionGroup,
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  GroupedRow,
} from "@/types/collection";
import type { CollectionRowProps } from "@/types/collection";

import { GroupHeaderCollection } from "./groupHeader.collection";

function CollectionRowView({
  item,
  statuses,
  selected,
  onOpen,
  onEdit,
  onSetStatus,
}: CollectionRowProps) {
  const { t } = useI18n();
  const { cachedUrl } = useCoverCache(item.coverUrl, item.thumbBlobId ?? item.coverBlobId);
  const cover = useMemo(() => {
    if (cachedUrl) return cachedUrl;
    if (item.coverUrl) return item.coverUrl;
    if (item.title) return generatePlaceholder(item.title);
    return "";
  }, [cachedUrl, item.coverUrl, item.title]);
  const progress =
    item.progressTotal != null && item.progressTotal > 0
      ? { value: item.progressValue, total: item.progressTotal }
      : null;

  return (
    <div
      className={`windows95-active-border bg-primary flex max-h-36 min-h-28 flex-row p-2 [contain-intrinsic-size:auto_116px] [content-visibility:auto] ${selected ? "outline-secondary outline-2" : ""}`}
    >
      <div className="flex w-full flex-row items-start justify-between gap-2 xl:flex-row-reverse">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex flex-row gap-2">
            <h2
              className="windows95-text flex flex-row gap-1 truncate leading-tight font-bold"
              title={item.title}
            >
              <span
                className="windows95-border mt-0.5 shrink-0"
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  backgroundColor: statusColorOf(statuses, item.status),
                }}
                title={statusLabel(statuses, item.status, t)}
              />
              {item.title}
            </h2>
          </div>

          <div className="windows95-text mt-auto flex flex-row items-center gap-2 font-bold">
            {item.rating != null && item.rating > 0 && (
              <span className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs">
                <Star className="size-3 fill-white" /> {item.rating}
              </span>
            )}
            {onSetStatus ? (
              <select
                value={item.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onSetStatus(item, e.target.value as CollectionStatus)}
                className="windows95-border h-5 min-w-0 bg-white px-1 text-xs leading-none font-normal"
                aria-label={t("collection.card.status")}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {statusLabel(statuses, s.id, t)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-text text-xs">{statusLabel(statuses, item.status, t)}</span>
            )}
            {progress && (
              <div className="flex items-center gap-1">
                <div className="windows95-border relative h-3.5 w-20 overflow-hidden bg-white">
                  <div
                    className="bg-secondary h-full"
                    style={{
                      width: `${Math.min(100, Math.round((progress.value / progress.total) * 100))}%`,
                    }}
                  />
                </div>
                <span className="windows95-text text-xs">
                  {progress.value}/{progress.total}
                </span>
              </div>
            )}
            {!progress && item.progressValue > 0 && (
              <span className="bg-secondary px-1 text-xs text-white">
                {item.progressValue} {item.progressUnit}
              </span>
            )}
            {onEdit && (
              <Button
                size="icon"
                className="size-5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                aria-label={t("collection.card.edit")}
              >
                <Edit2 className="size-3" />
              </Button>
            )}
          </div>
        </section>

        {cover && (
          <div
            className={
              onOpen
                ? "shrink-0 hover:cursor-pointer hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted active:brightness-90"
                : "shrink-0"
            }
            role={onOpen ? "button" : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen ? () => onOpen(item) : undefined}
            onKeyDown={onOpen ? enterOrSpace(() => onOpen(item)) : undefined}
            aria-label={onOpen ? item.title : undefined}
          >
            <Image
              src={cover}
              alt={`${item.title} cover`}
              className="windows95-active-border h-full w-14 shrink-0"
              loading="eager"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function sameRowVisual(prev: CollectionRowProps, next: CollectionRowProps): boolean {
  const a = prev.item;
  const b = next.item;
  return (
    prev.statuses === next.statuses &&
    prev.selected === next.selected &&
    prev.onOpen === next.onOpen &&
    prev.onEdit === next.onEdit &&
    a.id === b.id &&
    a.title === b.title &&
    a.coverUrl === b.coverUrl &&
    a.coverBlobId === b.coverBlobId &&
    a.thumbBlobId === b.thumbBlobId &&
    a.status === b.status &&
    a.rating === b.rating &&
    a.progressValue === b.progressValue &&
    a.progressTotal === b.progressTotal &&
    a.progressUnit === b.progressUnit
  );
}

const CollectionRow = memo(CollectionRowView, sameRowVisual);

export default function ListCollection({
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
  const parentRef = useRef<HTMLElement>(null);
  const headerVariant = useSettingsStore((s) => s.collectionGroupHeaderStyle);
  const grouped = Boolean(groups?.length);
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
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groups ?? []) map.set(group.status.id, group.items.length);
    return map;
  }, [groups]);

  const rowVirtualizer = useVirtualizer({
    count: grouped ? rows!.length : items.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      if (!grouped) return items[index]?.id ?? index;
      const row = rows![index];
      return row.kind === "header" ? `header-${row.status.id}` : row.item.id;
    },
    estimateSize: (index) => {
      if (!grouped) return ROW_ESTIMATE;
      return rows![index].kind === "header" ? HEADER_ESTIMATE : ROW_ESTIMATE;
    },
    overscan: 4,
  });

  return (
    <section
      ref={parentRef}
      className="windows95-border flex min-h-0 w-full flex-1 [scrollbar-gutter:stable] flex-col gap-1 overflow-y-auto border bg-white p-1"
    >
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = grouped ? rows![virtualRow.index] : null;
          if (grouped && !row) return null;
          const isHeader = grouped && row!.kind === "header";
          let item: CollectionItem | null = null;
          if (!grouped) {
            item = items[virtualRow.index] ?? null;
          } else if (row!.kind === "item") {
            item = row!.item;
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
              {isHeader ? (
                <GroupHeaderCollection
                  status={row!.status}
                  count={groupCounts.get(row!.status.id) ?? 0}
                  collapsed={Boolean(collapsedStatuses?.has(row!.status.id))}
                  variant={headerVariant}
                  onToggle={() => onToggleStatusCollapsed?.(row!.status.id)}
                />
              ) : item ? (
                <CollectionRow
                  item={item}
                  statuses={statuses}
                  selected={selectedId != null && item.id === selectedId}
                  onOpen={onOpen}
                  onEdit={onEdit}
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
