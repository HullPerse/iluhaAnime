import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentPlaybackState } from "@/hooks/player/torrentPlaybackState.hook";
import { formatBytes } from "@/lib/utils/bytes.utils";

export type BufferingReason = "locked" | "paused" | null;

/** Why playback is waiting, as far as the torrent state can tell. */
export function bufferingReason(state: TorrentPlaybackState | null): BufferingReason {
  if (state?.currentLocked) return "locked";
  if (state?.paused) return "paused";
  return null;
}

/** Locked rows for the side panel, or undefined when there are none to show. */
export function lockedPlaylistRows(
  state: TorrentPlaybackState | null
): { name: string; size: number }[] | undefined {
  return state?.locked.map((file) => ({ name: file.name, size: file.size }));
}

export default function BufferingBadge({
  visible,
  cacheSpeed,
  reason,
}: {
  visible: boolean;
  cacheSpeed?: number;
  reason: BufferingReason;
}) {
  const { t } = useI18n();
  if (!visible) return null;

  const hint = reason === "locked" ? t("player.stream.not.selected") : "";
  const pauseHint = reason === "paused" ? t("player.stream.paused") : "";

  return (
    <div
      className="windows95-border bg-primary/95 absolute top-4 right-4 z-30 max-w-xs p-2 text-left"
      data-testid="player-buffering"
      role="status"
    >
      <div className="windows95-text text-xs font-bold">{t("player.stream.buffering")}</div>
      <div className="windows95-font text-hint text-xs">
        {cacheSpeed && cacheSpeed > 0
          ? `${formatBytes(cacheSpeed)}/s`
          : t("player.stream.waiting")}
      </div>
      {hint ? <div className="windows95-font text-destructive text-xs">{hint}</div> : null}
      {pauseHint ? (
        <div className="windows95-font text-destructive text-xs">{pauseHint}</div>
      ) : null}
    </div>
  );
}
