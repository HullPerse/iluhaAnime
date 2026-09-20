import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TorrentSelectionBarProps } from "@/types/torrent";

/**
 * Actions for the current selection. It sits below the list, not above it: the buttons stay next
 * to the rows they act on and the filter/sort controls keep their place while it is open.
 */
export function TorrentSelectionBar({
  count,
  busy,
  onPause,
  onResume,
  onRecheck,
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
