import { Edit2, Star } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { CARD_H, CARD_POSTER_H, CARD_W } from "@/config/collection.config";
import { useCoverCache } from "@/hooks/coverCache.hook";
import { generatePlaceholder } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { CollectionItem, CollectionStatus } from "@/types/collection";

import { statusColorOf, useStatusLabel, useStatuses } from "./context.collection";

type Props = {
  item: CollectionItem;
  onEdit: (item: CollectionItem) => void;
  onDelete?: (itemId: string) => void;
  onOpen: (item: CollectionItem) => void;
  onProgress?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
};

export function CollectionCard({ item, onEdit, onOpen, onSetStatus }: Props) {
  const { t } = useI18n();
  const statuses = useStatuses();
  const statusLabel = useStatusLabel();
  const { cachedUrl } = useCoverCache(item.coverUrl, item.coverBlobId);
  const cover = useMemo(() => {
    if (cachedUrl) return cachedUrl;
    if (item.coverUrl) return item.coverUrl;
    if (item.title) return generatePlaceholder(item.title);
    return "";
  }, [cachedUrl, item.coverUrl, item.title]);
  return (
    <div
      className="windows95-active-border flex shrink-0 flex-col overflow-hidden bg-white select-none"
      style={{ width: CARD_W, height: CARD_H }}
    >
      <div
        className="relative w-full shrink-0 overflow-hidden bg-white hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        style={{ height: CARD_POSTER_H }}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={enterOrSpace(() => onOpen(item))}
        aria-label={item.title}
      >
        {cover ? (
          <Image
            src={cover}
            alt={item.title}
            className="h-full w-full bg-white"
            type="cover"
          />
        ) : (
          <div className="text-hint flex h-full w-full items-center justify-center bg-white text-xs">
            {t("image.fallback")}
          </div>
        )}
        <span
          className="windows95-border absolute top-1 left-1 h-3 w-3"
          style={{ backgroundColor: statusColorOf(statuses, item.status) }}
          title={statusLabel(item.status)}
          aria-label={statusLabel(item.status)}
        />
        {item.isFavorite && (
          <span className="absolute top-1 right-1 rounded bg-black/60 px-1 py-0.5 text-xs leading-none font-bold text-yellow-400">
            <Star className="inline size-3 fill-yellow-400" />
          </span>
        )}
        {item.rating != null && (
          <span className="bg-secondary absolute bottom-1 left-1 px-1 py-0.5 text-xs leading-none font-bold text-white">
            {item.rating}/10
          </span>
        )}
        {item.progressTotal != null && item.progressTotal > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div
              className="bg-secondary h-full"
              style={{
                width: `${Math.min(100, (item.progressValue / item.progressTotal) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>
      <div className="bg-primary flex min-h-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 flex-col justify-center gap-0 px-1 py-1">
          <h3
            className="windows95-text truncate text-xs leading-none font-bold"
            title={item.title}
          >
            {item.title}
          </h3>
          <div className="text-hint flex items-center gap-1 truncate text-xs leading-none">
            {item.year && <span className="shrink-0">{item.year}</span>}
            {item.type !== "custom" && (
              <span className="shrink-0 capitalize">{item.type}</span>
            )}
            {item.genres[0] && (
              <span className="min-w-0 truncate">
                {item.genres.slice(0, 2).join(", ")}
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
        <div className="windows95-border-t bg-primary flex h-7 shrink-0 items-center gap-1 px-1">
          {onSetStatus ? (
            <select
              value={item.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onSetStatus(item, e.target.value as CollectionStatus)}
              className="windows95-border h-5 min-w-0 flex-1 bg-white px-1 text-xs leading-none"
              aria-label={t("collection.card.status")}
              title={statusLabel(item.status)}
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {statusLabel(s.id)}
                </option>
              ))}
            </select>
          ) : (
            <span className="windows95-border bg-white px-1 py-0.5 text-xs leading-none" aria-hidden>
              {statusLabel(item.status)}
            </span>
          )}
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
        </div>
      </div>
    </div>
  );
}
