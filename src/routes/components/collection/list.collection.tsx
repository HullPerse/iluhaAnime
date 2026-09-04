import { useVirtualizer } from "@tanstack/react-virtual";
import { Edit2, Star } from "lucide-react";
import { memo, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { useCoverCache } from "@/hooks/coverCache.hook";
import { generatePlaceholder, statusColorOf, statusLabel } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { CollectionItem, CollectionStatus, CollectionStatusDef } from "@/types/collection";

const ROW_ESTIMATE = 116;

interface CollectionRowProps {
  item: CollectionItem;
  statuses: CollectionStatusDef[];
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}

function CollectionRowView({ item, statuses, onOpen, onEdit, onSetStatus }: CollectionRowProps) {
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
    <div className="windows95-active-border bg-primary flex max-h-36 min-h-28 flex-row p-2 [contain-intrinsic-size:auto_116px] [content-visibility:auto]">
      <main className="flex w-full flex-row items-start justify-between gap-2 xl:flex-row-reverse">
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
            {item.rating != null && (
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
                ? "shrink-0 hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
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
      </main>
    </div>
  );
}

function sameRowVisual(prev: CollectionRowProps, next: CollectionRowProps): boolean {
  const a = prev.item;
  const b = next.item;
  return (
    prev.statuses === next.statuses &&
    prev.onOpen === next.onOpen &&
    prev.onEdit === next.onEdit &&
    prev.onSetStatus === next.onSetStatus &&
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
  const parentRef = useRef<HTMLElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => items[index]?.id ?? index,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 4,
  });

  return (
    <section
      ref={parentRef}
      className="windows95-border flex min-h-0 w-full flex-1 [scrollbar-gutter:stable] flex-col gap-1 overflow-y-auto border bg-white p-1"
    >
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
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
              <CollectionRow
                item={item}
                statuses={statuses}
                onOpen={onOpen}
                onEdit={onEdit}
                onSetStatus={onSetStatus}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
