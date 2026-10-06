import { cn } from "cn";

import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/hooks/i18n.hook";
import { pingBarCount } from "@/lib/session/ping.utils";

export interface SignalBarsProps {
  /** null before the first probe. */
  rttMs: number | null | undefined;
  checking: boolean;
}

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
