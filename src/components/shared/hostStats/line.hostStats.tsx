import { useI18n } from "@/hooks/i18n.hook";
import { formatBytes } from "@/lib/core/bytes.utils";
import { fmtSpeed } from "@/lib/torrent/torrentCommon.utils";
import type { HostStats } from "@/types/core/ipc";

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
