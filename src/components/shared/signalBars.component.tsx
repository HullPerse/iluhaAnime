import { cn } from "cn";

import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/hooks/i18n.hook";
import { pingBarCount } from "@/lib/session/ping.utils";

export interface SignalBarsProps {
  /** Measured RTT in ms; `null` before the first successful probe. */
  rttMs: number | null | undefined;
  /** A probe is in flight: the spinner replaces the bars. */
  checking: boolean;
}

/**
 * Ping meter: five bars of growing height, filled from the left by the last
 * measured RTT. While a probe runs the bars are swapped for a spinner, so a
 * stale reading is never shown as a fresh one; the tooltip always names the
 * real millisecond value behind the bars.
 */
export function SignalBars({ rttMs, checking }: SignalBarsProps) {
  const { t } = useI18n();
  if (checking) {
    return (
      <span
        aria-label={t("lobby.saved.checking")}
        className="inline-flex h-5 items-center"
        role="status"
      >
        <SmallLoader size={4} />
      </span>
    );
  }
  const filled = pingBarCount(rttMs);
  const title =
    rttMs === null || rttMs === undefined
      ? t("lobby.saved.noPing")
      : t("lobby.saved.ping", { ms: Math.round(rttMs).toString() });
  return (
    <span
      aria-label={title}
      className="inline-flex h-5 items-end gap-px"
      role="status"
      title={title}
    >
      {[1, 2, 3, 4, 5].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-1",
            bar <= filled
              ? "bg-primary border border-text"
              : "bg-secondary"
          )}
          style={{ height: `${bar * 0.25}rem` }}
        />
      ))}
    </span>
  );
}
