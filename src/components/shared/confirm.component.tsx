import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { ConfirmDialogProps } from "@/types/ui";

import Modal from "./modal.component";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  if (!open) return null;
  const resolvedCancel = cancelLabel ?? t("common.cancel");

  return (
    <Modal header={title} onClose={onClose ?? onCancel} className="w-xl">
      <section className="flex flex-1 flex-col">
        <p className="windows95-text text-text">{message}</p>
        <div className="mt-auto ml-auto flex justify-end gap-1">
          <Button onClick={onCancel} autoFocus>
            {resolvedCancel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </Modal>
  );
}

export { ConfirmDialog };
