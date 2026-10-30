import { dayLabel } from "@/lib/core/activity.utils";
import { useI18n } from "@/hooks/i18n.hook";
import { cn } from "cn";

export function CalendarDayHeader() {
  const { locale } = useI18n();
  return (
    <div className="grid grid-cols-7">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className={cn(
            "windows95-font border-t-muted border-l-muted border-r border-b p-1 text-center text-xs font-bold",
            i >= 5 ? "text-destructive" : "text-text"
          )}
        >
          {dayLabel(i, locale)}
        </div>
      ))}
    </div>
  );
}
