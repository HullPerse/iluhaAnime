import { Edit2, X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useEscapeClose } from "@/hooks/useEscapeClose.hook";
import { statusLabel } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

import { DetailActionsCollection } from "./actions.collection";
import { DetailCoverCollection } from "./detailCover.collection";
import { DetailFactsCollection } from "./facts.collection";
import { SimilarCollection } from "./similar.collection";
import { SitesCollection } from "./sites.collection";

export function DetailCollection({
  item,
  items,
  statuses,
  onClose,
  onOpenItem,
  onEdit,
  onDelete,
  updateItem,
  refreshMetadata,
}: {
  item: CollectionItem;
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  onClose: () => void;
  onOpenItem: (item: CollectionItem) => void;
  onEdit: (item: CollectionItem) => void;
  onDelete?: (id: string) => void;
  updateItem: (id: string, patch: Partial<CollectionItem>) => void;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
}) {
  const { t } = useI18n();
  useEscapeClose(onClose);
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
            {item.coverUrl && <DetailCoverCollection url={item.coverUrl} />}
            <div className="flex flex-col gap-1 text-xs">
              <DetailFactsCollection
                item={item}
                statuses={statuses}
                statusText={statusLabel(statuses, item.status, t)}
              />
              <DetailActionsCollection
                item={item}
                onClose={onClose}
                updateItem={updateItem}
                refreshMetadata={refreshMetadata}
              />
            </div>
          </div>
          {item.description && <p className="mt-2 text-xs">{item.description}</p>}
          {item.notes && (
            <div className="windows95-border mt-2 bg-white p-1">
              <strong className="text-xs">{t("collection.details.notes")}</strong>
              <p className="text-xs">{item.notes}</p>
            </div>
          )}
          <SitesCollection item={item} />
          <SimilarCollection items={items} item={item} onOpenItem={onOpenItem} />
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
