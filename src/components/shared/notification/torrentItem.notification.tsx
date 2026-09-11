import { Download } from "lucide-react";

import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { fmtSpeed, stateLabel } from "@/lib/torrent/common.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { formatETA } from "@/lib/utils/time.utils";
import type { TorrentInfo } from "@/types/torrent";

export default function ActiveTorrentItem({ item }: { item: TorrentInfo }) {
  const { t } = useI18n();
  const progress = Math.max(0, Math.min(1, item.progress));
  const percentage = Math.round(progress * 100);
  const eta = formatETA(item.eta_secs, t);
  const speed = fmtSpeed(item.download_speed);

  return (
    <div className="border-muted/30 border-b px-1 py-1">
      <div className="flex items-center gap-1">
        <Download className="text-secondary size-3 shrink-0" />
        <span
          className="windows95-text min-w-0 flex-1 truncate text-xs font-bold"
          title={item.name}
        >
          {item.name}
        </span>
        <span className="windows95-text shrink-0 text-xs">{percentage}%</span>
      </div>
      <ProgressBar
        value={percentage}
        max={100}
        className="mt-1 h-2"
        ariaLabel={`${item.name} ${percentage}%`}
      />
      <div className="text-hint windows95-text mt-0.5 flex flex-wrap gap-x-2 text-xs">
        <span>
          {formatBytes(item.progress_bytes)} / {formatBytes(item.total_bytes)}
        </span>
        <span>{stateLabel(item.state, t)}</span>
        {speed && <span>{t("torrent.summary.download", { speed })}</span>}
        {eta && <span>{t("torrent.eta.label", { time: eta })}</span>}
      </div>
    </div>
  );
}
