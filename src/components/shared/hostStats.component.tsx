import { useI18n } from "@/lib/locale/i18n.utils";
import { fmtSpeed } from "@/lib/torrent/common.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import type { HostStats } from "@/types/ipc";

export function HostStatsLine({
  stats,
  showNet = false,
  className = "windows95-text text-hint text-xs",
}: {
  stats: HostStats | null;
  showNet?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  if (!stats) return null;
  return (
    <span className={className}>
      {t("torrent.host.stats", {
        cpu: Math.round(stats.cpuUsage),
        used: formatBytes(stats.memoryUsed),
        total: formatBytes(stats.memoryTotal),
      })}
      {showNet &&
        t("torrent.host.stats.net", {
          rx: fmtSpeed(stats.netRxBps) || "0 B/s",
          tx: fmtSpeed(stats.netTxBps) || "0 B/s",
        })}
    </span>
  );
}
