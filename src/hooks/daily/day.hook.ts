import { useEffect, useState } from "react";

import { dailyGameDay, nextDailyResetAt } from "@/lib/daily/reset.utils";

export function useDailyGameDay(): string {
  const [day, setDay] = useState(() => dailyGameDay(Date.now()));

  useEffect(() => {
    let timer: number;
    const schedule = (): void => {
      const now = Date.now();
      setDay(dailyGameDay(now));
      timer = window.setTimeout(schedule, Math.max(1000, nextDailyResetAt(now) - now + 250));
    };
    timer = window.setTimeout(
      schedule,
      Math.max(1000, nextDailyResetAt(Date.now()) - Date.now() + 250)
    );
    return () => window.clearTimeout(timer);
  }, []);

  return day;
}
