import { useEffect, useRef } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { formatBytes, formatRate } from "@/lib/core/bytes.utils";
import { formatClock } from "@/lib/core/time.utils";
import { variantOf } from "@/lib/player/streamHelpers.utils";
import { playbackAtoms } from "@/store/player.store";
import type { StreamVariant } from "@/types/player/stream";
import type { StreamOpen } from "@/types/player/videoPlayer";
import { StatRow } from "@/routes/components/player/media/statRow.player";

export function StreamStats({
  session,
  variants,
  onClose,
}: {
  session: StreamOpen;
  variants: StreamVariant[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const ahead = useCell(playbackAtoms.cacheDuration);
  const cached = useCell(playbackAtoms.cacheBytes);
  const speed = useCell(playbackAtoms.cacheSpeed);
  const buffering = useCell(playbackAtoms.cacheBufferingState);
  const cacheIdle = useCell(playbackAtoms.cacheIdle);
  const pausedForCache = useCell(playbackAtoms.pausedForCache);
  const width = useCell(playbackAtoms.videoWidth);
  const height = useCell(playbackAtoms.videoHeight);
  const fps = useCell(playbackAtoms.fpsRender);
  const drops = useCell(playbackAtoms.dropCount);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (ref.current && target instanceof Node && !ref.current.contains(target)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const voice = variantOf(variants, session.variantId);
  const unknown = t("player.stream.stats.unknown");
  const resolution = width !== undefined && height !== undefined ? `${width}x${height}` : unknown;
  const frameRate = fps === undefined ? unknown : fps.toFixed(2);
  const dropped = drops === undefined ? unknown : String(drops);
  const fillRate = speed === undefined ? "" : formatRate(speed);

  return (
    <div
      ref={ref}
      className="windows95-border bg-primary absolute right-0 bottom-full z-50 flex w-60 flex-col p-1 select-none"
    >
      <div className="border-muted mb-1 flex items-baseline justify-between gap-1 border-b-2 pb-0.5">
        <span className="windows95-text min-w-0 truncate text-xs font-bold">
          {session.sourceName}
        </span>
        <span className="windows95-text bg-secondary shrink-0 px-1 text-xs text-white">
          {session.quality || "-"}
        </span>
      </div>

      {pausedForCache === true && buffering !== undefined && (
        <div className="mb-1 flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between">
            <span className="text-hint text-xs">{t("player.stream.buffer.fill")}</span>
            <span className="text-text text-xs tabular-nums">{Math.round(buffering)}%</span>
          </div>
          <ProgressBar
            value={buffering}
            max={100}
            className="h-2"
            ariaLabel={t("player.stream.buffer.fill")}
          />
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <StatRow
          label={t("player.stream.voice")}
          value={voice?.name ?? t("player.media.tracks.none")}
        />
      </div>

      <div className="border-muted mt-1 flex flex-col gap-0.5 border-t-2 pt-1">
        <StatRow
          label={t("player.stream.buffer.ahead")}
          value={ahead === undefined ? "-" : formatClock(ahead)}
        />
        <StatRow
          label={t("player.stream.buffer.cached")}
          value={cached === undefined ? "-" : formatBytes(cached)}
        />
        <StatRow label={t("player.stream.buffer.speed")} value={fillRate || "-"} />
        {cacheIdle === true && (
          <span className="text-hint text-xs">{t("player.stream.buffer.idle")}</span>
        )}
      </div>

      <div className="border-muted mt-1 flex flex-col gap-0.5 border-t-2 pt-1">
        <StatRow label={t("player.stream.stats.resolution")} value={resolution} />
        <StatRow label={t("player.stream.stats.fps")} value={frameRate} />
        <StatRow label={t("player.stream.stats.dropped")} value={dropped} />
      </div>
    </div>
  );
}
