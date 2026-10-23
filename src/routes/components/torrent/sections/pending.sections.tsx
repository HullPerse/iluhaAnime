import type { ReactNode } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import {
  DISPLAY_BAR_CLASS,
  displayStateLabel,
  fmtSpeed,
  getDisplayState,
} from "@/lib/torrent/common.utils";
import { formatETA } from "@/lib/utils/time.utils";
import { torrentAtoms } from "@/store/download.store";
import type { TorrentInfo } from "@/types/torrent";

export function TorrentPendingState({ item, actions }: { item: TorrentInfo; actions?: ReactNode }) {
  const { t } = useI18n();
  const lastActiveAt = useCell(torrentAtoms.lastActiveAt);
  const display = getDisplayState(item, lastActiveAt, Date.now());
  const label = displayStateLabel(display, t);
  const hasSize = item.total_bytes > 0;
  const showProgress = display !== "missing" && (hasSize || display === "initializing");
  const percent = Math.round(item.progress * 100);
  const speed = display === "downloading" ? fmtSpeed(item.download_speed) : "";
  const eta = display === "downloading" ? formatETA(item.eta_secs, t) : "";

  return (
    <section className="windows95-text flex flex-col gap-0.5 px-0.5 py-0.5">
      <div className="flex items-center gap-1 text-xs">
        <span>{label}</span>
        {hasSize && <span className="text-hint tabular-nums">{percent}%</span>}
        {speed && <span className="text-hint tabular-nums">{speed}</span>}
        {eta && <span className="text-hint tabular-nums">{eta}</span>}
        {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
      </div>
      {showProgress && (
        <ProgressBar
          value={item.progress_bytes}
          max={item.total_bytes}
          className="h-3"
          barClassName={DISPLAY_BAR_CLASS[display]}
          indeterminate={display === "initializing"}
          ariaLabel={label}
        />
      )}
      {display === "checking" && item.checking_file && (
        <span
          className="windows95-text text-hint min-w-0 truncate text-xs"
          title={item.checking_file}
        >
          {t("torrent.checking.file", { name: item.checking_file })}
        </span>
      )}
      {display !== "missing" && (
        <span className="text-hint text-xs">{t("player.torrent.pending")}</span>
      )}
    </section>
  );
}
