import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Check, Link, Save } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { buildTorrentLink } from "@/lib/utils/deeplink.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { CreateTorrentProps, CreatedTorrent } from "@/types/torrent";

/**
 * Turns a folder into a `.torrent` and seeds it from where the files already are. Hashing reads
 * every file once, so the window has to stay open until it finishes: there is no partial result
 * to show before the metainfo exists.
 */
export default function CreateTorrentModal({ open, onClose, onCreated }: CreateTorrentProps) {
  const { t } = useI18n();
  const [folder, setFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedTorrent | null>(null);

  if (!open) return null;

  const handleClose = () => {
    setFolder("");
    setCreated(null);
    setCreating(false);
    onClose();
  };

  const browse = async () => {
    const [dir, error] = await attempt(openDialog({ directory: true }));
    if (error) {
      reportBackgroundError("torrent.create.browse", error);
      return;
    }
    if (dir) setFolder(dir);
  };

  const create = async () => {
    if (!folder || creating) return;
    setCreating(true);
    const [result, error] = await attempt(
      invokeTyped<CreatedTorrent>("create_torrent_from_folder", { sourceDir: folder })
    );
    setCreating(false);
    if (error || !result) {
      showError(t("torrent.create.failed"), error?.message ?? "");
      return;
    }
    setCreated(result);
    onCreated(result);
    useNotificationStore
      .getState()
      .add(t("torrent.create.title"), "success", t("torrent.create.done", { name: result.name }));
  };

  const saveTorrent = async () => {
    if (!created) return;
    const target = await saveDialog({
      defaultPath: `${created.name}.torrent`,
      filters: [{ name: "Torrent", extensions: ["torrent"] }],
    });
    if (!target) return;
    const [, error] = await attempt(
      invokeTyped("save_created_torrent", { from: created.torrent_path, to: target })
    );
    if (error) showError(t("torrent.create.failed"), error.message);
  };

  const copyLink = async () => {
    if (!created) return;
    const [, error] = await attempt(writeText(buildTorrentLink(created.info_hash)));
    if (error) showError(t("torrent.copy.link"), error.message);
  };

  if (creating) {
    return (
      <Modal header={t("torrent.create.title")} onClose={handleClose} className="w-lg">
        <section className="flex flex-col items-center justify-center gap-2 py-4">
          <SmallLoader />
          <span className="windows95-text text-hint text-center text-xs">
            {t("torrent.create.busy")}
          </span>
        </section>
      </Modal>
    );
  }

  if (created) {
    return (
      <Modal header={t("torrent.create.title")} onClose={handleClose} className="w-lg">
        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-center gap-1">
            <Check className="text-success size-4 shrink-0" />
            <span className="windows95-text">
              {t("torrent.create.done", { name: created.name })}
            </span>
          </div>
          <span className="windows95-text text-hint text-xs">
            {t("torrent.create.files", { count: created.file_count })}
          </span>
          <span className="windows95-text">{t("torrent.create.hash")}</span>
          <Input className="w-full" value={created.info_hash} readOnly />
          <span className="windows95-text">{t("torrent.create.link")}</span>
          <Input className="w-full" value={buildTorrentLink(created.info_hash)} readOnly />
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            <Button variant="secondary" title={t("torrent.copy.link")} onClick={copyLink}>
              <Link />
              {t("torrent.copy.link")}
            </Button>
            <Button variant="secondary" title={t("torrent.create.save")} onClick={saveTorrent}>
              <Save />
              {t("torrent.create.save")}
            </Button>
            <Button onClick={handleClose}>{t("common.close")}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal header={t("torrent.create.title")} onClose={handleClose} className="w-lg">
      <div className="flex flex-col gap-2 py-2">
        <span className="windows95-text">{t("torrent.create.folder")}</span>
        <div className="flex items-center gap-1">
          <Input className="flex-1" value={folder} readOnly />
          <Button onClick={browse}>{t("torrent.create.browse")}</Button>
        </div>
        <span className="windows95-text text-hint text-xs">{t("torrent.create.hint")}</span>
        <div className="mt-2 flex justify-end gap-1">
          <Button onClick={handleClose}>{t("common.cancel")}</Button>
          <Button disabled={!folder} onClick={create}>
            {t("torrent.create.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
