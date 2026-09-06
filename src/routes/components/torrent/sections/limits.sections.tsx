import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useTorrentStore } from "@/store/download.store";

export function TorrentLimitsSection({ id }: { id: number }) {
  const { t } = useI18n();
  const [downloadInput, setDownloadInput] = useState("");
  const [uploadInput, setUploadInput] = useState("");
  useEffect(() => {
    let cancelled = false;
    useTorrentStore
      .getState()
      .getTorrentLimits(id)
      .then((limits) => {
        if (cancelled) return;
        if (limits.downloadBps !== null)
          setDownloadInput(String(Math.round(limits.downloadBps / 1024)));
        if (limits.uploadBps !== null) setUploadInput(String(Math.round(limits.uploadBps / 1024)));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const applyLimits = () => {
    const download = downloadInput === "" ? null : Number(downloadInput);
    const upload = uploadInput === "" ? null : Number(uploadInput);
    if (download !== null && (!Number.isFinite(download) || download <= 0)) return;
    if (upload !== null && (!Number.isFinite(upload) || upload <= 0)) return;
    useTorrentStore.getState().setTorrentLimits(id, { download, upload });
  };
  const invalid =
    (downloadInput !== "" && !(Number(downloadInput) > 0)) ||
    (uploadInput !== "" && !(Number(uploadInput) > 0));
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      <span className="windows95-text text-xs">{t("torrent.limits")}</span>
      <Input
        className="h-5 w-16 text-xs"
        placeholder="DL"
        value={downloadInput}
        onChange={(e) => setDownloadInput(e.target.value)}
      />
      <Input
        className="h-5 w-16 text-xs"
        placeholder="UL"
        value={uploadInput}
        onChange={(e) => setUploadInput(e.target.value)}
      />
      <Button
        size="icon"
        className="size-5"
        title={invalid ? t("torrent.limits.invalid") : t("torrent.limits.apply")}
        onClick={applyLimits}
      >
        <Check className="size-3" />
      </Button>
      {invalid && <span className="text-destructive text-xs">{t("torrent.limits.invalid")}</span>}
    </div>
  );
}
