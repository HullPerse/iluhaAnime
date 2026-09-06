import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

export function WizardFooter({
  editing,
  initial,
  onDelete,
  onClose,
  requestClose,
  canSave,
  onSave,
  confirmDiscard,
  cancelDiscard,
  resultsLabel,
}: {
  editing: boolean;
  initial: CollectionItem | null | undefined;
  onDelete?: (id: string) => void;
  onClose: () => void;
  requestClose: () => void;
  canSave: boolean;
  onSave: () => void;
  confirmDiscard: boolean;
  cancelDiscard: () => void;
  resultsLabel: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="windows95-border-t bg-primary flex items-center gap-2 p-2">
        <span className="text-hint hidden text-xs md:inline">
          {editing ? t("collection.edit.media") : resultsLabel}
        </span>
        {editing && initial && onDelete && (
          <Button
            variant="destructive"
            onClick={() => {
              onDelete(initial.id);
              onClose();
            }}
          >
            {t("common.delete")}
          </Button>
        )}
        <div className="ml-auto flex gap-1">
          <Button onClick={requestClose}>{t("common.cancel")}</Button>
          <Button variant="outline" disabled={!canSave} onClick={onSave}>
            {t("collection.wizard.save")}
          </Button>
        </div>
      </div>
      {confirmDiscard && (
        <ConfirmDialog
          open
          title={t("collection.wizard.discard.title")}
          message={t("collection.wizard.discard.message")}
          confirmLabel={t("common.discard")}
          onConfirm={onClose}
          onCancel={cancelDiscard}
          onClose={cancelDiscard}
        />
      )}
    </>
  );
}
