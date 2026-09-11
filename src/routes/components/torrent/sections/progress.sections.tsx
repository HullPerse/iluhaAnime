import { ArrowUp } from "lucide-react";

import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import {
  DISPLAY_BAR_CLASS,
  displayStateLabel,
  fmtSpeed,
  getDisplayState,
} from "@/lib/torrent/common.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { formatETA } from "@/lib/utils/time.utils";
import { useTorrentStore } from "@/store/download.store";
import type { TorrentInfo } from "@/types/torrent";

export function TorrentProgress({ item }: { item: TorrentInfo }) {
  const { t } = useI18n();
  const lastActiveAt = useTorrentStore((s) => s.lastActiveAt);
  const display = getDisplayState(item, lastActiveAt, Date.now());
  const progress = item.progress * 100;
  return (
    <section className="flex w-full flex-row items-start justify-between gap-1">
      <div className="flex w-full flex-col">
        <ProgressBar
          value={item.progress_bytes}
          max={item.total_bytes}
          className="h-3"
          barClassName={DISPLAY_BAR_CLASS[display]}
        />
        <div className="flex items-center gap-1">
          <span className="windows95-text text-hint">{displayStateLabel(display, t)}</span>
          <span className="windows95-font text-xs">
            {item.total_bytes > 0
          ? `${formatBytes(item.progress_bytes)} / ${formatBytes(item.total_bytes)} (${progress.toFixed(1)}%)`
          : formatBytes(item.progress_bytes)}
          </span>
          <span className="windows95-font text-hint text-xs">
            {fmtSpeed(item.download_speed)}
            {item.share_ratio > 0 && (
              <span className="ml-1">
                {t("torrent.ratio", { ratio: item.share_ratio.toFixed(2) })}
              </span>
            )}
            {fmtSpeed(item.download_speed) && formatETA(item.eta_secs, t) && " - "}
            {formatETA(item.eta_secs, t)}
          </span>
          <span className="ml-auto flex flex-row">
            {(item.upload_speed > 0 || item.uploaded_bytes > 0 || item.peers_connected > 0) && (
              <div className="flex items-center gap-1">
                {item.upload_speed > 0 && (
                  <span className="text-hint windows95-font text-xs">
                    <ArrowUp className="inline size-2.5" /> {fmtSpeed(item.upload_speed)}
                  </span>
                )}
                {item.uploaded_bytes > 0 && (
                  <span className="text-hint windows95-font text-xs">
          <ArrowUp className="inline size-2.5" /> {formatBytes(item.uploaded_bytes)}
                  </span>
                )}
                <span className="text-hint windows95-font text-xs">{t("torrent.peers", { count: item.peers_connected })}</span>
              </div>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
