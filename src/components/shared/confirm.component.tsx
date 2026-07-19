import Modal from "./modal.component";
import { Button } from "@/components/ui/button.component";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
  onClose?: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Отмена",
  variant = "default",
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <Modal header={title} onClose={onClose ?? onCancel} className="w-xl">
      <section className="flex flex-col flex-1">
        <p className="windows95-text text-text">{message}</p>
        <div className="flex justify-end gap-1 ml-auto mt-auto">
          <Button onClick={onCancel}>{cancelLabel}</Button>
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
