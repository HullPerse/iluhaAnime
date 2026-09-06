import { Edit2 } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem, CollectionStatus, CollectionStatusDef } from "@/types/collection";

export function CardStatusBar({
  item,
  statuses,
  onEdit,
  onSetStatus,
}: {
  item: CollectionItem;
  statuses: CollectionStatusDef[];
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="windows95-border-t bg-primary flex h-7 shrink-0 items-center gap-1 px-1">
      {onSetStatus ? (
        <select
          value={item.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSetStatus(item, e.target.value as CollectionStatus)}
          className="windows95-border h-5 min-w-0 flex-1 bg-white px-1 text-xs leading-none"
          aria-label={t("collection.card.status")}
          title={statusLabel(statuses, item.status, t)}
        >
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {statusLabel(statuses, s.id, t)}
            </option>
          ))}
        </select>
      ) : (
        <span className="windows95-border bg-white px-1 py-0.5 text-xs leading-none">
          {statusLabel(statuses, item.status, t)}
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
  );
}
