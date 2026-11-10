import { cn } from "cn";

import { useI18n } from "@/hooks/i18n.hook";
import { dayLabel } from "@/lib/core/anilist/activity.utils";

export function CalendarDayHeader() {
  const { locale } = useI18n();
  return (
    <div className="bg-surface grid grid-cols-7">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className={cn(
            "windows95-font border-b-muted border-r-muted/60 border-r border-b p-1 text-center text-[10px] font-bold tracking-wide uppercase",
            i >= 5 ? "text-destructive" : "text-text"
          )}
        >
          {dayLabel(i, locale)}
        </div>
      ))}
    </div>
  );
}
