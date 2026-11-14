import { cn } from "cn";
import { useEffect, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { formatResetCountdown, nextDailyResetAt } from "@/lib/daily/reset.utils";

export default function GameResetTimer({ className }: { className?: string }) {
  const { t } = useI18n();
  const [remaining, setRemaining] = useState(() => nextDailyResetAt(Date.now()) - Date.now());

  useEffect(() => {
    const tick = (): void => {
      setRemaining(Math.max(0, nextDailyResetAt(Date.now()) - Date.now()));
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      className={cn("daily-reset-timer", className)}
      data-testid="daily-reset-timer"
      title={t("collection.game.reset.hint")}
    >
      <span className="daily-reset-timer-clock">{formatResetCountdown(remaining)}</span>
    </span>
  );
}
