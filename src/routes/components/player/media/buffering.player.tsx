import { useEffect, useRef, useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { useI18n } from "@/hooks/i18n.hook";
import { formatRate } from "@/lib/core/bytes.utils";
import { useCell } from "@/lib/core/signal.hook";
import { scheduleTask } from "@/lib/core/shared.utils";
import { formatClock } from "@/lib/core/time.utils";
import { playbackAtoms, streamSession } from "@/store/player.store";

/**
 * A stall shorter than this is not worth a full-screen wash: the frozen frame
 * for one or two ticks reads as a glitch, not as a wait.
 */
const SHOW_DELAY_MS = 400;
/** Once shown, the overlay stays at least this long so it cannot flicker. */
const MIN_VISIBLE_MS = 400;
/** After this long with no data the wait is a stall, not a hiccup. */
const STALL_AFTER_MS = 12_000;

/**
 * Shown while mpv's cache runs dry and playback is parked. A stream gets the
 * honest numbers - how much is loaded ahead and how fast it arrives - while a
 * slow local file (a network share, a spinning disk) just says it is reading.
 *
 * `cache-buffering-state` is deliberately not shown: it is the fill level
 * until mpv unpauses, not how much of the episode has arrived, so a percentage
 * here promised progress that did not exist. It lives in the stats popover.
 */
function BufferingOverlay({ visible }: { visible: boolean }) {
  const { t } = useI18n();
  const ahead = useCell(playbackAtoms.cacheDuration);
  const speed = useCell(playbackAtoms.cacheSpeed);
  const session = useCell(streamSession);
  const [shown, setShown] = useState<boolean>(false);
  const shownAt = useRef<number>(0);
  const [stalled, setStalled] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) {
      const elapsed = Date.now() - shownAt.current;
      if (shown && elapsed < MIN_VISIBLE_MS) {
        const task = scheduleTask("timeout", MIN_VISIBLE_MS - elapsed, () => setShown(false));
        return () => task.cancel();
      }
      setShown(false);
      return;
    }
    if (shown) return;
    const task = scheduleTask("timeout", SHOW_DELAY_MS, () => {
      shownAt.current = Date.now();
      setShown(true);
    });
    return () => task.cancel();
  }, [visible, shown]);

  useEffect(() => {
    if (!shown) {
      setStalled(false);
      return;
    }
    const task = scheduleTask("timeout", STALL_AFTER_MS, () => setStalled(true));
    return () => task.cancel();
  }, [shown]);

  if (!shown) return null;

  const streaming = session !== null;
  const label = streaming
    ? stalled
      ? t("player.stream.buffering.stalled", { seconds: STALL_AFTER_MS / 1000 })
      : t("player.stream.buffering")
    : t("player.stream.buffering.local");
  // The live region hears one stable sentence; the changing numbers stay out of
  // it so a screen reader does not read a new percentage every tick.
  const detail: string[] = [];
  if (streaming && !stalled) {
    if (ahead !== undefined && ahead > 0) {
      detail.push(t("player.stream.buffering.ahead", { time: formatClock(ahead) }));
    }
    if (speed !== undefined) detail.push(formatRate(speed));
  }

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
        <span className="windows95-text text-xs font-bold">{label}</span>
        {detail.length > 0 && (
          <span className="text-hint text-xs tabular-nums" aria-hidden="true">
            {detail.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

export default BufferingOverlay;
