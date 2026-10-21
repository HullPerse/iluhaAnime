import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

interface DeleteTorrentDialogProps {
  open: boolean;
  message: string;
  note?: string;
  keepLabel?: string;
  onWithFiles: () => void;
  onKeepFiles: () => void;
  onClose: () => void;
}

export function DeleteTorrentDialog({
  open,
  message,
  note,
  keepLabel,
  onWithFiles,
  onKeepFiles,
  onClose,
}: DeleteTorrentDialogProps) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <Modal header={t("torrent.delete.title")} onClose={onClose} className="w-xl">
      <section className="flex flex-1 flex-col">
        <p className="windows95-text text-text">{message}</p>
        {note && <p className="windows95-text text-destructive mt-1">{note}</p>}
        <div className="mt-auto ml-auto flex justify-end gap-1">
          <Button onClick={onClose} autoFocus>
            {t("common.cancel")}
          </Button>
          <Button onClick={onKeepFiles}>{keepLabel ?? t("torrent.keep.files")}</Button>
          <Button variant="destructive" onClick={onWithFiles}>
            {t("torrent.delete.with.files")}
          </Button>
        </div>
      </section>
    </Modal>
  );
}
