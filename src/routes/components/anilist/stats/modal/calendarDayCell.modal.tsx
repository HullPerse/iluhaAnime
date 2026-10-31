import { cn } from "cn";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { monthLabel } from "@/lib/core/activity.utils";
import { calendarCellTone, calendarDayNumberTone } from "@/lib/anilist/statsCalendar.utils";
import type { CalendarCell } from "@/types/anilist/stats.anilist";

export function CalendarDayCell({
  day,
  cell,
  isToday,
  isWeekend,
  onEntryClick,
  onMoreClick,
  month,
  year,
}: {
  day: number;
  cell: CalendarCell | undefined;
  isToday: boolean;
  isWeekend: boolean;
  onEntryClick: (id: number) => void;
  onMoreClick: (day: number) => void;
  month: number;
  year: number;
}) {
  const { t, locale } = useI18n();
  const mainEntry = cell?.entries[0];
  return (
    <div
      className={cn(
        "border-t-muted border-l-muted relative flex h-26 flex-col overflow-hidden border-r border-b",
        calendarCellTone(isToday, isWeekend)
      )}
    >
      <span className={cn("px-1 text-xs leading-tight", calendarDayNumberTone(isToday, isWeekend))}>
        {day}
      </span>
      {mainEntry && (
        <div
          className="flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1"
          onClick={() => onEntryClick(mainEntry.id)}
          title={mainEntry.title}
        >
          {mainEntry.coverUrl && (
            <ImageComponent
              src={mainEntry.coverUrl}
              alt="coverUrl"
              className="windows95-border h-13 w-10 object-cover"
            />
          )}
          <button
            type="button"
            className="windows95-font w-full cursor-pointer truncate px-1 text-center text-xs leading-tight"
            data-vim-target="stats-entry"
            title={mainEntry.title}
          >
            {mainEntry.title}
          </button>
          {mainEntry.episode != null && (
            <div className="flex items-center gap-1">
              <span className="text-hint windows95-font text-xs">
                {t("anilist.activity.episode", { n: mainEntry.episode })}
              </span>
            </div>
          )}
          {cell != null && cell.entries.length > 1 && (
            <button
              type="button"
              aria-label={t("anilist.stats.more.releases", {
                count: cell.entries.length,
                date: `${day} ${monthLabel(month, locale, "long")} ${year}`,
              })}
              className="bg-secondary windows95-font hover:bg-secondary/80 text-title-text absolute top-0.5 right-0.5 flex size-5 flex-row items-center justify-center border-black text-xs hover:cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onMoreClick(day);
              }}
            >
              <span>+</span>
              <span>{cell.entries.length - 1}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
