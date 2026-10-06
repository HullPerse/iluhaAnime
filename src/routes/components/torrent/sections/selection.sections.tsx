import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentSelectionBarProps } from "@/types/torrent";

export function TorrentSelectionBar({
  count,
  busy,
  onPause,
  onResume,
  onRecheck,
  onDelete,
  onTrackers,
  onLimits,
  onSelectAll,
  onClear,
}: TorrentSelectionBarProps) {
  const { t } = useI18n();
  return (
    <section
      className="windows95-active-border bg-primary flex flex-wrap items-center gap-1 p-0.5"
      role="status"
      aria-live="polite"
    >
      <span className="windows95-text px-1 text-xs">{t("torrent.bulk.selected", { count })}</span>
      <Button className="windows95-text flex items-center" disabled={busy} onClick={onPause}>
        {t("torrent.bulk.pause")}
      </Button>
      <Button className="windows95-text flex items-center" disabled={busy} onClick={onResume}>
        {t("torrent.bulk.resume")}
      </Button>
      <Button className="windows95-text flex items-center" disabled={busy} onClick={onRecheck}>
        {t("torrent.bulk.recheck")}
      </Button>
      <Button
        variant="error"
        className="windows95-text flex items-center"
        disabled={busy}
        onClick={onDelete}
      >
        {t("torrent.bulk.remove")}
      </Button>
      <Button className="windows95-text flex items-center" disabled={busy} onClick={onTrackers}>
        {t("torrent.bulk.trackers")}
      </Button>
      <Button className="windows95-text flex items-center" disabled={busy} onClick={onLimits}>
        {t("torrent.bulk.limits")}
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button className="windows95-text flex items-center" onClick={onSelectAll}>
          {t("torrent.bulk.select.all")}
        </Button>
        <Button className="windows95-text flex items-center" onClick={onClear}>
          {t("torrent.bulk.clear")}
        </Button>
      </div>
    </section>
  );
}
