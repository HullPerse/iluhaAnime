import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionItem } from "@/types/collection";

export function WizardFooter({
  editing,
  initial,
  onDelete,
  onClose,
  requestClose,
  canSave,
  saving,
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
  saving: boolean;
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
        <Button
          rendered={editing && initial != null && onDelete != null}
          variant="destructive"
          onClick={() => {
            if (initial && onDelete) onDelete(initial.id);
            onClose();
          }}
        >
          {t("common.delete")}
        </Button>
        <div className="ml-auto flex gap-1">
          <Button onClick={requestClose}>{t("common.cancel")}</Button>
          <Button variant="outline" disabled={!canSave} loading={saving} onClick={onSave}>
            {t("collection.wizard.save")}
          </Button>
        </div>
      </div>
      {confirmDiscard && (
        <div className="bg-primary absolute inset-0 flex flex-col p-2">
          <p className="windows95-text text-text font-bold">
            {t("collection.wizard.discard.title")}
          </p>
          <p className="windows95-text text-text mt-1">{t("collection.wizard.discard.message")}</p>
          <div className="mt-auto ml-auto flex justify-end gap-1">
            <Button onClick={cancelDiscard} autoFocus>
              {t("common.cancel")}
            </Button>
            <Button onClick={onClose}>{t("common.discard")}</Button>
          </div>
        </div>
      )}
    </>
  );
}
