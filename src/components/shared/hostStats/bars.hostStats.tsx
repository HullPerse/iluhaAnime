import { useI18n } from "@/hooks/i18n.hook";
import { useSessionPeak } from "@/hooks/hostStatsPeak.hook";
import { formatBytes } from "@/lib/core/bytes.utils";
import { pressureTone } from "@/lib/core/hostStatsPressure.utils";
import { formatSpeed } from "@/lib/torrent/torrentCommon.utils";
import type { HostStats } from "@/types/core/ipc";

import { StatBar } from "@/components/shared/hostStats/statBar.hostStats";

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
