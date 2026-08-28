import { Eye, FolderOpen, HardDrive, Trash2 } from "lucide-react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

interface HiddenFolder {
  path: string;
  name: string;
}

interface HiddenTorrent {
  infoHash: string;
  name: string;
}

interface Props {
  folders: HiddenFolder[];
  torrents: HiddenTorrent[];
  onUnhideFolder: (path: string) => void;
  onUnhideTorrent: (infoHash: string) => void;
  onClose: () => void;
}

export default function PlayerVisibilityModal({
  folders,
  torrents,
  onUnhideFolder,
  onUnhideTorrent,
  onClose,
}: Props) {
  const { t } = useI18n();
  const isEmpty = folders.length === 0 && torrents.length === 0;

  return (
    <Modal
      header={t("player.visibility.title")}
      onClose={onClose}
      className="w-[min(40rem,92vw)]"
    >
      <div className="flex max-h-[min(32rem,65vh)] flex-col gap-2 overflow-y-auto">
        {isEmpty && (
          <div className="windows95-border bg-surface windows95-text p-3 text-center text-xs">
            {t("player.visibility.empty")}
          </div>
        )}

        {folders.length > 0 && (
          <section className="windows95-border bg-primary">
            <header className="bg-secondary flex items-center gap-1 px-1 py-0.5 text-white">
              <FolderOpen className="size-3" />
              <span className="windows95-font text-xs font-bold">
                {t("player.visibility.folders")}
              </span>
            </header>
            <div className="p-1">
              {folders.map((folder) => (
                <div
                  key={folder.path}
                  className="flex items-center gap-1 border-b border-black/10 py-1 last:border-0"
                >
                  <FolderOpen className="size-4 shrink-0" />
                  <span
                    className="windows95-text min-w-0 flex-1 truncate text-xs"
                    title={folder.path}
                  >
                    {folder.name}
                  </span>
                  <Button
                    size="icon"
                    className="size-5 shrink-0"
                    title={t("player.visibility.unhide")}
                    onClick={() => onUnhideFolder(folder.path)}
                  >
                    <Eye className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {torrents.length > 0 && (
          <section className="windows95-border bg-primary">
            <header className="bg-secondary flex items-center gap-1 px-1 py-0.5 text-white">
              <HardDrive className="size-3" />
              <span className="windows95-font text-xs font-bold">
                {t("player.visibility.torrents")}
              </span>
            </header>
            <div className="p-1">
              {torrents.map((torrent) => (
                <div
                  key={torrent.infoHash}
                  className="flex items-center gap-1 border-b border-black/10 py-1 last:border-0"
                >
                  <HardDrive className="size-4 shrink-0" />
                  <span
                    className="windows95-text min-w-0 flex-1 truncate text-xs"
                    title={torrent.infoHash}
                  >
                    {torrent.name}
                  </span>
                  <Button
                    size="icon"
                    className="size-5 shrink-0"
                    title={t("player.visibility.unhide")}
                    onClick={() => onUnhideTorrent(torrent.infoHash)}
                  >
                    <Eye className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isEmpty && (
          <div className="text-hint flex items-center gap-1 text-xs">
            <Trash2 className="size-3" />
            <span className="windows95-text">
              {t("player.visibility.note")}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
