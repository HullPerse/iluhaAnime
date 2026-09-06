import { ConfirmDialog } from "@/components/shared/confirm.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function SqliteDialogs({
  pendingDelete,
  pendingBatchDelete,
  selectedRows,
  selectedTable,
  onDeleteRow,
  onCancelDelete,
  onDeleteBatch,
  onCancelBatch,
}: {
  pendingDelete: string[] | null;
  pendingBatchDelete: boolean;
  selectedRows: Record<string, string[]>;
  selectedTable: string;
  onDeleteRow: () => void;
  onCancelDelete: () => void;
  onDeleteBatch: () => void;
  onCancelBatch: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {pendingDelete && (
        <ConfirmDialog
          open
          title={t("settings.sqlite.delete.title")}
          message={t("settings.sqlite.delete.message", {
            key: Array.isArray(pendingDelete) ? pendingDelete.join(" | ") : pendingDelete,
            table: selectedTable,
          })}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={onDeleteRow}
          onCancel={onCancelDelete}
          onClose={onCancelDelete}
        />
      )}
      {pendingBatchDelete && (
        <ConfirmDialog
          open
          title={t("settings.sqlite.delete.title")}
          message={t("settings.sqlite.delete.selected", {
            count: Object.keys(selectedRows).length,
          })}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={onDeleteBatch}
          onCancel={onCancelBatch}
          onClose={onCancelBatch}
        />
      )}
    </>
  );
}
