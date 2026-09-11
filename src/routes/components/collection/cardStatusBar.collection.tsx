import { Edit2 } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { sortStatuses, statusLabel } from "@/lib/collection/status.utils";
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
  const { t, locale } = useI18n();
  return (
    <div className="windows95-border-t bg-primary flex h-7 shrink-0 items-center gap-1 px-1">
      {onSetStatus ? (
        <Select
          value={item.status}
          onChange={(v) => onSetStatus(item, v as CollectionStatus)}
          options={sortStatuses(statuses).map((s) => ({
            value: s.id,
            label: statusLabel(statuses, s.id, t, locale),
          }))}
          label={t("collection.card.status")}
          className="min-h-0 min-w-0 flex-1 text-xs"
        />
      ) : (
        <span className="windows95-border bg-white px-1 py-0.5 text-xs leading-none">
          {statusLabel(statuses, item.status, t, locale)}
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
