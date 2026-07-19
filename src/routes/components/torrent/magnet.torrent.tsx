import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import Modal from "@/components/shared/modal.component";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";

const MAGNET_RX = /^magnet:\?xt=urn:btih:/i;

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
    <Modal header="Добавить торрент" onClose={handleClose} className="w-xl">
      <div className="flex flex-col gap-2 py-2">
        <span className="windows95-text">Magnet-ссылка:</span>
        <Input
          className="w-full"
          placeholder="magnet:?xt=urn:btih:..."
          value={magnetInput}
          onChange={(e) => setMagnetInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && magnetInput.trim()) {
              handleClose();
              onAddMagnet(magnetInput.trim());
            }
          }}
          autoFocus
        />
        <div className="flex items-center gap-1 mt-1">
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
            Выбрать .torrent
          </Button>
        </div>
        <div className="flex justify-end gap-1 mt-2">
          <Button onClick={handleClose}>Отмена</Button>
          <Button
            onClick={() => {
              if (magnetInput.trim()) {
                handleClose();
                onAddMagnet(magnetInput.trim());
              }
            }}
            disabled={!magnetInput.trim()}
          >
            Продолжить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
