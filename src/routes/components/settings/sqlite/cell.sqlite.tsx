import { Check, Copy, Pencil } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function CellModal({
  selectedCell,
  cellValue,
  cellLoading,
  cellEditing,
  cellEdit,
  cellSaving,
  cellCopied,
  cellImageSrc,
  canEditCell,
  onClose,
  onCopy,
  onEdit,
  onEditChange,
  onCancelEdit,
  onSave,
}: {
  selectedCell: { column: string; keys: string[] | null; display: string };
  cellValue: string;
  cellLoading: boolean;
  cellEditing: boolean;
  cellEdit: string;
  cellSaving: boolean;
  cellCopied: boolean;
  cellImageSrc: string | null;
  canEditCell: boolean;
  onClose: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onEditChange: (value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      header={`${t("settings.sqlite.cell.title")} - ${selectedCell.column}`}
      onClose={onClose}
      className="w-xl"
    >
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-hint text-xs">
            {t("settings.sqlite.cell.column")}: {selectedCell.column}
          </span>
          <div className="flex gap-1">
            <Button className="h-5" onClick={onCopy} disabled={!cellValue || cellLoading}>
              {cellCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {cellCopied ? t("settings.sqlite.cell.copied") : t("settings.sqlite.cell.copy")}
            </Button>
            <Button className="h-5" onClick={onEdit} disabled={!canEditCell}>
              <Pencil className="size-3" />
              {t("settings.sqlite.cell.edit")}
            </Button>
          </div>
        </div>
        {cellLoading ? (
          <div className="flex min-h-20 items-center justify-center">
            <SmallLoader />
          </div>
        ) : cellEditing ? (
          <>
            <textarea
              value={cellEdit}
              onChange={(e) => onEditChange(e.target.value)}
              placeholder={t("settings.sqlite.cell.placeholder")}
              disabled={cellSaving}
              spellCheck={false}
              className="windows95-border text-text windows95-text placeholder:text-hint disabled:bg-primary disabled:text-hint bg-field min-h-24 w-full resize-y p-1 font-mono text-xs outline-none"
            />
            <div className="flex justify-end gap-1">
              <Button className="h-5" onClick={onCancelEdit} disabled={cellSaving}>
                {t("settings.sqlite.cell.cancel")}
              </Button>
              <Button className="h-5" variant="success" onClick={onSave} disabled={cellSaving}>
                {cellSaving ? <SmallLoader /> : <Check className="size-3" />}
                {t("settings.sqlite.cell.save")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {cellImageSrc && (
              <div className="windows95-border bg-primary flex h-64 items-center justify-center p-1">
                <Image
                  src={cellImageSrc}
                  alt={selectedCell.column}
                  type="contain"
                  className="bg-field h-full w-full"
                />
              </div>
            )}
            <pre className="windows95-border text-text windows95-text bg-field max-h-64 min-h-20 w-full overflow-auto p-1 text-xs wrap-break-word whitespace-pre-wrap">
              {cellValue}
            </pre>
          </>
        )}
      </section>
    </Modal>
  );
}
