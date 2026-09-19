import { useEffect, useState } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatSpeed, fmtSpeed } from "@/lib/torrent/common.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import type { HostStats } from "@/types/ipc";

const WARN_PERCENT = 80;
const CRITICAL_PERCENT = 95;

function pressureTone(percent: number): string {
  if (percent >= CRITICAL_PERCENT) return "bg-destructive";
  if (percent >= WARN_PERCENT) return "bg-orange-500";
  return "bg-highlight";
}

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

function StatBar({
  label,
  value,
  max,
  text,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  tone: string;
}) {
  return (
    <span className="windows95-text text-hint flex items-center gap-1 text-xs">
      <span className="w-7 shrink-0">{label}</span>
      <ProgressBar value={value} max={max} className="h-2 w-16" barClassName={tone} />
      <span className="windows95-font text-text text-xs">{text}</span>
    </span>
  );
}

/**
 * CPU, memory and network as thin bars. Memory and CPU read against their real ceiling, while
 * throughput has none, so its bar is scaled to the session peak and the number stays absolute.
 */
function useSessionPeak(value: number): number {
  const [peak, setPeak] = useState(0);
  useEffect(() => {
    setPeak((previous) => Math.max(previous, value));
  }, [value]);
  return Math.max(peak, value, 1);
}

export function HostStatsBars({ stats }: { stats: HostStats | null }) {
  const { t } = useI18n();
  const net = stats ? stats.netRxBps + stats.netTxBps : 0;
  const netScale = useSessionPeak(net);
  if (!stats) return null;

  const memoryPercent = stats.memoryTotal > 0 ? (stats.memoryUsed / stats.memoryTotal) * 100 : 0;
  return (
    <span className="flex items-center gap-2">
      <StatBar
        label={t("torrent.host.bar.cpu")}
        value={stats.cpuUsage}
        max={100}
        text={`${Math.round(stats.cpuUsage)}%`}
        tone={pressureTone(stats.cpuUsage)}
      />
      <StatBar
        label={t("torrent.host.bar.ram")}
        value={stats.memoryUsed}
        max={stats.memoryTotal}
        text={`${formatBytes(stats.memoryUsed)} / ${formatBytes(stats.memoryTotal)}`}
        tone={pressureTone(memoryPercent)}
      />
      <StatBar
        label={t("torrent.host.bar.net")}
        value={net}
        max={netScale}
        text={`${formatSpeed(stats.netRxBps)} / ${formatSpeed(stats.netTxBps)}`}
        tone="bg-highlight"
      />
    </span>
  );
}
