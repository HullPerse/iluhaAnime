import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/signal.hook";
import { playbackAtoms } from "@/store/player.store";

/**
 * Shown while mpv's cache runs dry and playback is parked. The frame behind it
 * is frozen by mpv itself, so a translucent wash and the app loader are enough
 * to explain the wait; the layer is click-through so pausing still works.
 */
function BufferingOverlay({ visible }: { visible: boolean }) {
  const { t } = useI18n();
  const buffering = useCell(playbackAtoms.cacheBufferingState);

  if (!visible) return null;
  const percent = buffering === undefined ? null : Math.round(buffering);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/50"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-buffering-overlay=""
    >
      <div className="windows95-border bg-primary flex min-w-32 flex-col items-center gap-1 px-4 py-2">
        <SmallLoader />
        <span className="windows95-text text-xs font-bold">{t("player.stream.buffering")}</span>
        {percent === null ? null : (
          <span className="text-hint text-xs tabular-nums">{percent}%</span>
        )}
      </div>
    </div>
  );
}

export default BufferingOverlay;
