import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useAddTorrentTracker, useRemoveTorrentTracker } from "@/hooks/torrent/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";

export function TorrentTrackersBlock({
  id,
  infoHash,
  trackers,
}: {
  id: number;
  infoHash: string;
  trackers: string[];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const addTracker = useAddTorrentTracker();
  const removeTracker = useRemoveTorrentTracker();
  const busy = addTracker.isPending || removeTracker.isPending;
  const submit = () => {
    const tracker = draft.trim();
    if (tracker === "" || busy) return;
    addTracker.mutate({ id, tracker, infoHash }, { onSuccess: (ok) => ok && setDraft("") });
  };
  return (
    <div className="windows95-text flex min-w-0 flex-col gap-0.5 text-xs">
      <span className="font-bold">{t("torrent.diagnostics.trackers")}</span>
      {trackers.map((tracker) => (
        <div key={tracker} className="flex items-center gap-1">
          <span className="text-hint min-w-0 flex-1 truncate" title={tracker}>
            {tracker}
          </span>
          <Button
            size="icon"
            className="size-5 shrink-0"
            title={t("torrent.diagnostics.tracker.remove")}
            aria-label={`${t("torrent.diagnostics.tracker.remove")}: ${tracker}`}
            disabled={busy}
            onClick={() => removeTracker.mutate({ id, tracker, infoHash })}
          >
            <X className="size-3" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <Input
          className="min-w-0 flex-1"
          placeholder={t("torrent.diagnostics.tracker.placeholder")}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <Button
          size="icon"
          className="size-5 shrink-0"
          title={t("torrent.diagnostics.tracker.add")}
          aria-label={t("torrent.diagnostics.tracker.add")}
          disabled={draft.trim() === "" || busy}
          onClick={submit}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
