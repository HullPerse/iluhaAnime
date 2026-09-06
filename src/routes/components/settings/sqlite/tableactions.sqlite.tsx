import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function TableActions({
  selectedCount,
  hasPrimaryKeys,
  deleting,
  onBatchDelete,
  canExport,
  onExport,
}: {
  selectedCount: number;
  hasPrimaryKeys: boolean;
  deleting: boolean;
  onBatchDelete: () => void;
  canExport: boolean;
  onExport: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {hasPrimaryKeys && (
        <span className="text-hint windows95-text text-xs">
          {selectedCount > 0 ? t("settings.sqlite.selected.count", { count: selectedCount }) : ""}
        </span>
      )}
      {hasPrimaryKeys && (
        <Button
          className="h-5"
          variant="destructive"
          disabled={selectedCount === 0 || deleting}
          onClick={onBatchDelete}
          title={t("settings.sqlite.delete.selected", { count: selectedCount })}
        >
          <Trash2 className="size-3" />
          {t("settings.sqlite.delete.selected", { count: selectedCount })}
        </Button>
      )}
      <Button
        className="h-5"
        disabled={!canExport}
        onClick={onExport}
        title={t("settings.sqlite.export")}
      >
        Export
      </Button>
    </>
  );
}
