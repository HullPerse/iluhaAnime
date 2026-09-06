import { Star } from "lucide-react";
import { memo, useMemo } from "react";

import Image from "@/components/ui/image.component";
import { CARD_POSTER_H, CARD_W, GENRE_PREVIEW_COUNT } from "@/config/collection/card.config";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import { statusColorOf, statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { CollectionCardProps } from "@/types/collection";

import { CardStatusBar } from "./cardStatusBar.collection";

function CollectionCardView({
  item,
  statuses,
  selected,
  onOpen,
  onEdit,
  onSetStatus,
}: CollectionCardProps) {
  const { t } = useI18n();
  const { cachedUrl } = useCoverCache(item.coverUrl, item.thumbBlobId ?? item.coverBlobId);
  const cover = useMemo(() => {
    if (cachedUrl) return cachedUrl;
    if (item.coverUrl) return item.coverUrl;
    if (item.title) return generatePlaceholder(item.title);
    return "";
  }, [cachedUrl, item.coverUrl, item.title]);
  const progressPercent =
    item.progressTotal != null && item.progressTotal > 0
      ? Math.min(100, (item.progressValue / item.progressTotal) * 100)
      : null;

  return (
    <div
      className={`windows95-active-border flex w-full flex-col overflow-hidden bg-white select-none [contain-intrinsic-size:auto] [content-visibility:auto] ${selected ? "outline-secondary outline-2" : ""}`}
    >
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-white ${onOpen ? "hover:cursor-pointer hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted active:brightness-90" : ""}`}
        style={{ aspectRatio: `${CARD_W} / ${CARD_POSTER_H}` }}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? () => onOpen(item) : undefined}
        onKeyDown={onOpen ? enterOrSpace(() => onOpen(item)) : undefined}
        aria-label={onOpen ? item.title : undefined}
      >
        {cover ? (
          <Image
            src={cover}
            alt={item.title}
            className="h-full w-full bg-white"
            type="cover"
            loading="eager"
          />
        ) : (
          <div className="text-hint flex h-full w-full items-center justify-center bg-white text-xs">
            {t("image.fallback")}
          </div>
        )}
        <span
          className="windows95-border absolute top-1 left-1 h-3 w-3"
          style={{ backgroundColor: statusColorOf(statuses, item.status) }}
          aria-label={statusLabel(statuses, item.status, t)}
        />
        {item.isFavorite && (
          <span
            aria-hidden
            className="absolute top-1 right-1 rounded bg-black/60 px-1 py-0.5 text-xs leading-none font-bold text-yellow-400"
          >
            <Star className="inline size-3 fill-yellow-400" />
          </span>
        )}
        {item.rating != null && item.rating > 0 && (
          <span className="bg-secondary absolute bottom-1 left-1 px-1 py-0.5 text-xs leading-none font-bold text-white">
            {item.rating}/10
          </span>
        )}
        {progressPercent != null && (
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div className="bg-secondary h-full" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>
      <div className="bg-primary flex min-h-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 flex-col justify-center gap-0 px-1 py-1">
          <h3 className="windows95-text truncate text-xs leading-none font-bold" title={item.title}>
            {item.title}
          </h3>
          <div className="text-hint flex items-center gap-1 truncate text-xs leading-none">
            {item.year != null && <span className="shrink-0">{item.year}</span>}
            {item.genres[0] && (
              <span
                className="min-w-0 truncate"
                title={item.genres.slice(0, GENRE_PREVIEW_COUNT).join(", ")}
              >
                {item.genres.slice(0, GENRE_PREVIEW_COUNT).join(", ")}
              </span>
            )}
            <span className="ml-auto shrink-0 font-bold">
              {item.progressTotal
                ? `${item.progressValue}/${item.progressTotal}`
                : item.progressValue > 0
                  ? `${item.progressValue} ${item.progressUnit}`
                  : ""}
            </span>
          </div>
        </div>
        <CardStatusBar item={item} statuses={statuses} onEdit={onEdit} onSetStatus={onSetStatus} />
      </div>
    </div>
  );
}

function sameCardVisual(prev: CollectionCardProps, next: CollectionCardProps): boolean {
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
    a.year === b.year &&
    a.type === b.type &&
    a.status === b.status &&
    a.rating === b.rating &&
    a.isFavorite === b.isFavorite &&
    a.progressValue === b.progressValue &&
    a.progressTotal === b.progressTotal &&
    a.progressUnit === b.progressUnit &&
    a.genres.slice(0, GENRE_PREVIEW_COUNT).join(",") ===
      b.genres.slice(0, GENRE_PREVIEW_COUNT).join(",")
  );
}

export const CollectionCard = memo(CollectionCardView, sameCardVisual);
