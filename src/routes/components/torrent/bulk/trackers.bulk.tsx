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
  const [tracker, setTracker] = useState<string>("");
  if (!open) return null;
  const trimmed = tracker.trim();
  return (
    <Modal header={t("torrent.bulk.trackers.title")} onClose={onClose} className="w-lg">
      <div className="flex flex-col gap-2 p-1">
        <Input
          value={tracker}
          placeholder={t("torrent.diagnostics.tracker.placeholder")}
          onChange={(event) => setTracker(event.target.value)}
          aria-label={t("torrent.bulk.trackers.title")}
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
