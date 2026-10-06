import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";

export function BulkTrackerModal({
  open,
  busy,
  onClose,
  onApply,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onApply: (tracker: string) => void;
}) {
  const { t } = useI18n();
  const [tracker, setTracker] = useState("");
  if (!open) return null;
  const trimmed = tracker.trim();
  return (
    <Modal header={t("torrent.bulk.trackers")} onClose={onClose} className="w-lg">
      <div className="flex flex-col gap-2 p-1">
        <Input
          value={tracker}
          placeholder={t("torrent.diagnostics.tracker.placeholder")}
          onChange={(event) => setTracker(event.target.value)}
          aria-label={t("torrent.bulk.trackers")}
        />
        <div className="flex justify-end gap-1">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !trimmed} onClick={() => onApply(trimmed)}>
            {t("torrent.bulk.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function BulkLimitsModal({
  open,
  busy,
  onClose,
  onApply,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onApply: (limits: { download: number | null; upload: number | null }) => void;
}) {
  const { t } = useI18n();
  const [download, setDownload] = useState("");
  const [upload, setUpload] = useState("");
  if (!open) return null;
  const toLimit = (value: string): number | null => {
    if (value.trim() === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };
  return (
    <Modal header={t("torrent.bulk.limits")} onClose={onClose} className="w-lg">
      <div className="flex flex-col gap-2 p-1">
        <label className="windows95-text flex items-center gap-2 text-xs">
          DL
          <Input
            type="number"
            min={0}
            className="w-24"
            value={download}
            placeholder="KB/s"
            onChange={(event) => setDownload(event.target.value)}
          />
        </label>
        <label className="windows95-text flex items-center gap-2 text-xs">
          UL
          <Input
            type="number"
            min={0}
            className="w-24"
            value={upload}
            placeholder="KB/s"
            onChange={(event) => setUpload(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-1">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => onApply({ download: toLimit(download), upload: toLimit(upload) })}
          >
            {t("torrent.bulk.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
