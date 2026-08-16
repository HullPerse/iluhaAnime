import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { MAGNET_RX } from "@/config/torrent.config";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddMagnet: (magnet: string) => void;
  onAddFile: (filePath: string) => void;
}

export default function AddTorrentModal({
  open,
  onClose,
  onAddMagnet,
  onAddFile,
}: Props) {
  const [magnetInput, setMagnetInput] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const text = await readText();
        if (text && MAGNET_RX.test(text.trim())) {
          setMagnetInput(text.trim());
        }
      } catch {}
    })();
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    onClose();
    setMagnetInput("");
  };

  return (
    <Modal
      header={t("torrent.addTitle")}
      onClose={handleClose}
      className="w-xl"
    >
      <div className="flex flex-col gap-2 py-2">
        <span className="windows95-text">{t("torrent.magnetLink")}</span>
        <Input
          className="w-full"
          placeholder="magnet:?xt=urn:btih:..."
          value={magnetInput}
          onChange={(e) => setMagnetInput(e.target.value)}
          onKeyDown={enterSubmit(() => {
            if (magnetInput.trim()) {
              handleClose();
              onAddMagnet(magnetInput.trim());
            }
          })}
          autoFocus
        />
        <div className="mt-1 flex items-center gap-1">
          <Button
            onClick={async () => {
              const file = await openDialog({
                multiple: false,
                filters: [{ name: "Torrent", extensions: ["torrent"] }],
              });
              if (file) {
                handleClose();
                onAddFile(file);
              }
            }}
          >
            {t("torrent.chooseFile")}
          </Button>
        </div>
        <div className="mt-2 flex justify-end gap-1">
          <Button onClick={handleClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => {
              if (magnetInput.trim()) {
                handleClose();
                onAddMagnet(magnetInput.trim());
              }
            }}
            disabled={!magnetInput.trim()}
          >
            {t("common.continue")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
