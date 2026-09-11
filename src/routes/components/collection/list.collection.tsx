import { useVirtualizer } from "@tanstack/react-virtual";
import { Star } from "lucide-react";
import { memo, useMemo, useRef } from "react";

import { FavPeopleStar } from "@/components/shared/favPeopleStar.component";
import Image from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import { HEADER_ESTIMATE, ROW_ESTIMATE } from "@/config/collection/card.config";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import { sortStatuses, statusColorOf, statusLabel } from "@/lib/collection/status.utils";
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

export default function ListCollection({
  items,
  statuses,
  selectedId,
  onOpen,
  onSetStatus,
  groups,
  collapsedStatuses,
  onToggleStatusCollapsed,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  selectedId?: string | null;
  onOpen?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
  groups?: CollectionGroup[];
  collapsedStatuses?: Set<string>;
  onToggleStatusCollapsed?: (statusId: string) => void;
}) {
  const parentRef = useRef<HTMLElement>(null);
  const headerVariant = useSettingsStore((s) => s.collectionGroupHeaderStyle);
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
      className="windows95-border flex min-h-0 w-full flex-1 scrollbar-gutter-stable flex-col gap-1 overflow-y-auto border bg-white p-1"
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
                  status={row.status}
                  count={groupCounts.get(row.status.id) ?? 0}
                  collapsed={Boolean(collapsedStatuses?.has(row.status.id))}
                  variant={headerVariant}
                  onToggle={() => onToggleStatusCollapsed?.(row.status.id)}
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

function rowMetaParts(item: CollectionItem): string[] {
  const parts: string[] = [];
  if (item.year != null) parts.push(String(item.year));
  if (item.studio) parts.push(item.studio);
  const genres = item.genres.slice(0, 3).join(", ");
  if (genres) parts.push(genres);
  return parts;
}

function CollectionRowView({ item, statuses, selected, onOpen, onSetStatus }: CollectionRowProps) {
  const { t, locale } = useI18n();
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
  const meta = rowMetaParts(item);
  return (
    <div
      className={`windows95-active-border bg-primary hover:bg-surface flex max-h-36 min-h-28 flex-row p-2 [contain-intrinsic-size:auto_116px] [content-visibility:auto] hover:cursor-pointer ${selected ? "outline-secondary outline-2" : ""}`}
      onClick={onOpen ? () => onOpen(item) : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? item.title : undefined}
      onKeyDown={onOpen ? enterOrSpace(() => onOpen(item)) : undefined}
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
                title={statusLabel(statuses, item.status, t, locale)}
              />
              <FavPeopleStar animeId={item.externalIds.anilist} />
              {item.title}
            </h2>
          </div>
          {meta.length > 0 && (
            <div className="text-hint windows95-text truncate text-xs" title={meta.join(" • ")}>
              {meta.join(" • ")}
            </div>
          )}

          <div className="windows95-text mt-auto flex flex-row items-center gap-2 font-bold">
            {item.rating != null && item.rating > 0 && (
              <span className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs">
                <Star className="size-3 fill-white" /> {item.rating}
              </span>
            )}
            {onSetStatus ? (
              <Select
                value={item.status}
                onChange={(v) => onSetStatus(item, v as CollectionStatus)}
                options={sortStatuses(statuses).map((s) => ({
                  value: s.id,
                  label: statusLabel(statuses, s.id, t, locale),
                }))}
                label={t("collection.card.status")}
                className="w-auto max-w-44 min-w-0 flex-none min-h-0 text-xs font-normal"
              />
            ) : (
              <span className="text-text text-xs">
                {statusLabel(statuses, item.status, t, locale)}
              </span>
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
          </div>
        </section>

        {cover && (
          <div className="flex h-full">
            <Image
              src={cover}
              alt={`${item.title} cover`}
              className="windows95-active-border h-full w-14"
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
    a.id === b.id &&
    a.title === b.title &&
    a.coverUrl === b.coverUrl &&
    a.coverBlobId === b.coverBlobId &&
    a.thumbBlobId === b.thumbBlobId &&
    a.status === b.status &&
    a.rating === b.rating &&
    a.progressValue === b.progressValue &&
    a.progressTotal === b.progressTotal &&
    a.progressUnit === b.progressUnit &&
    a.year === b.year &&
    a.studio === b.studio &&
    a.type === b.type &&
    a.genres.length === b.genres.length &&
    a.genres.every((genre, index) => genre === b.genres[index])
  );
}

const CollectionRow = memo(CollectionRowView, sameRowVisual);
