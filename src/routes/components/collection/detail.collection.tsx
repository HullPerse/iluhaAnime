import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Edit2, Play, RefreshCw, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useCoverCache } from "@/hooks/coverCache.hook";
import { statusColorOf } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import type { CollectionItem, CollectionReview } from "@/types/collection";
import { useStatusLabel, useStatuses } from "./context.collection";
import { CollectionReviewsBlock } from "./reviews.collection";
import { SimilarItemsRow } from "./similar.collection";

export function CollectionDetailModal({
  item,
  reviews,
  items,
  onClose,
  onOpenItem,
  onEdit,
  onDelete,
  updateItem,
  refreshMetadata,
}: {
  item: CollectionItem;
  reviews: CollectionReview[];
  items: CollectionItem[];
  onClose: () => void;
  onOpenItem: (item: CollectionItem) => void;
  onEdit: (item: CollectionItem) => void;
  onDelete?: (id: string) => void;
  updateItem: (id: string, patch: Partial<CollectionItem>) => void;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
}) {
  const { t } = useI18n();
  const itemReviews = reviews.filter(
    (r) => r.itemId === item.id && !r.orphaned
  );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2">
      <div className="windows95-active-border bg-primary flex max-h-[85vh] w-full max-w-xl flex-col">
        <div className="ui-titlebar justify-between">
          <span className="truncate font-bold text-white">{item.title}</span>
          <Button size="icon" className="size-5" onClick={onClose}>
            <X className="size-3" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex gap-2">
            {item.coverUrl && <DetailCover url={item.coverUrl} />}
            <div className="flex flex-col gap-1 text-xs">
              <CollectionDetailFacts item={item} />
              <CollectionDetailActions
                item={item}
                onClose={onClose}
                updateItem={updateItem}
                refreshMetadata={refreshMetadata}
              />
            </div>
          </div>
          {item.description && (
            <p className="mt-2 text-xs">{item.description}</p>
          )}
          {item.notes && (
            <div className="windows95-border mt-2 bg-white p-1">
              <strong className="text-xs">
                {t("collection.details.notes")}
              </strong>
              <p className="text-xs">{item.notes}</p>
            </div>
          )}
          <CollectionReviewsBlock reviews={itemReviews} itemId={item.id} />
          <SimilarItemsRow items={items} item={item} onOpenItem={onOpenItem} />
        </div>
        <div className="windows95-border-t bg-primary flex justify-between gap-1 p-1">
          {onDelete && (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(item.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          )}
          <div className="ml-auto flex gap-1">
            <Button onClick={() => onEdit(item)}>
              <Edit2 className="size-3" /> {t("collection.details.edit")}
            </Button>
            <Button onClick={onClose}>{t("collection.details.close")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dropdown options for every status <select>, driven by the DB list. */

export function StatusOptions() {
  const statuses = useStatuses();
  const statusLabel = useStatusLabel();
  return (
    <>
      {statuses.map((s) => (
        <option key={s.id} value={s.id}>
          {statusLabel(s.id)}
        </option>
      ))}
    </>
  );
}

export function CollectionDetailFacts({ item }: { item: CollectionItem }) {
  const { t } = useI18n();
  const statuses = useStatuses();
  const statusLabel = useStatusLabel();
  return (
    <>
      <div className="flex items-center gap-1">
        <span
          className="windows95-border h-3 w-3"
          style={{ backgroundColor: statusColorOf(statuses, item.status) }}
        />
        {statusLabel(item.status)}{" "}
        {item.isFavorite && `(${t("collection.wizard.favorite")})`}
      </div>
      {item.year && (
        <div>
          {t("collection.details.year")}: {item.year}
        </div>
      )}
      {item.rating != null && (
        <div>
          {t("collection.details.rating")}: {item.rating}/10
        </div>
      )}
      <div>
        {t("collection.details.progress")}: {item.progressValue}
        {item.progressTotal ? `/${item.progressTotal}` : ""} {item.progressUnit}
      </div>
      <div>
        {t("collection.details.priority")}: {item.priority}
      </div>
      {item.rewatchCount > 0 && (
        <div>
          {t("collection.details.rewatched", {
            count: String(item.rewatchCount),
          })}
        </div>
      )}
      {item.localPath && (
        <div className="break-all">
          {t("collection.details.local")}: {item.localPath}
        </div>
      )}
      {item.externalIds.anilist && (
        <div>
          {t("collection.details.anilist")}: {item.externalIds.anilist}
        </div>
      )}
      {item.externalIds.tmdb && (
        <div>
          {t("collection.details.tmdb")}: {item.externalIds.tmdb}
        </div>
      )}
    </>
  );
}

export function CollectionDetailActions({
  item,
  onClose,
  updateItem,
  refreshMetadata,
}: {
  item: CollectionItem;
  onClose: () => void;
  updateItem: (id: string, patch: Partial<CollectionItem>) => void;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
}) {
  const { t } = useI18n();
  const openLocal = async () => {
    if (!item.localPath) return;
    try {
      await invoke("open_path", { path: item.localPath });
    } catch {
      try {
        await openUrl(item.localPath);
      } catch {}
    }
  };

  const rewatch = () => {
    updateItem(item.id, {
      rewatchCount: item.rewatchCount + 1,
      status: "rewatching",
      lastWatchedAt: Date.now(),
    });
  };

  return (
    <div className="mt-2 flex gap-1">
      <Button onClick={openLocal} disabled={!item.localPath}>
        <Play className="size-3" /> {t("collection.details.openLocal")}
      </Button>
      {item.externalIds.anilist && (
        <Button
          onClick={() =>
            openUrl(`https://anilist.co/anime/${item.externalIds.anilist}`)
          }
        >
          {t("collection.details.anilist")}
        </Button>
      )}
      <Button variant="outline" onClick={rewatch}>
        <RotateCcw className="size-3" /> {t("collection.details.rewatch")}
      </Button>
      <Button
        variant="outline"
        disabled={
          item.externalIds.anilist == null && item.externalIds.tmdb == null
        }
        onClick={() => refreshMetadata(item)}
      >
        <RefreshCw className="size-3" />{" "}
        {t("collection.details.refreshMetadata")}
      </Button>
      <Button variant="outline" onClick={onClose}>
        {t("collection.details.close")}
      </Button>
    </div>
  );
}

export function DetailCover({ url }: { url: string }) {
  const { cachedUrl } = useCoverCache(url);
  return (
    <img
      src={cachedUrl ?? url}
      alt=""
      className="windows95-border h-48 w-32 object-cover"
    />
  );
}