import { cn } from "cn";
import { Film } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { monthLabel } from "@/lib/core/anilist/activity.utils";
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
  const extraCount = (cell?.entries.length ?? 0) - 1;
  return (
    <div
      className={cn(
        "border-t-muted border-l-muted relative flex h-26 flex-col overflow-hidden border-r border-b",
        calendarCellTone(isToday, isWeekend),
        isToday && "shadow-[inset_0_0_0_1px_var(--color-secondary)]"
      )}
    >
      <div className="flex items-center justify-between gap-1 px-1 pt-0.5">
        <span
          className={cn(
            "windows95-font flex min-w-4 items-center justify-center text-xs leading-4",
            calendarDayNumberTone(isToday, isWeekend)
          )}
        >
          {day}
        </span>
        {extraCount > 0 && (
          <button
            type="button"
            aria-label={t("anilist.stats.more.releases", {
              count: cell?.entries.length ?? 0,
              date: `${day} ${monthLabel(month, locale, "long")} ${year}`,
            })}
            title={t("anilist.stats.more.releases", {
              count: cell?.entries.length ?? 0,
              date: `${day} ${monthLabel(month, locale, "long")} ${year}`,
            })}
            className="bg-secondary windows95-font text-title-text hover:bg-secondary/80 border-muted flex h-4 min-w-4 shrink-0 cursor-pointer items-center justify-center border px-0.5 text-[10px] leading-none"
            onClick={(e) => {
              e.stopPropagation();
              onMoreClick(day);
            }}
          >
            +{extraCount}
          </button>
        )}
      </div>
      {mainEntry && (
        <button
          type="button"
          aria-label={mainEntry.title}
          data-vim-target="stats-entry"
          title={mainEntry.title}
          className="hover:bg-surface/70 focus-visible:bg-surface flex min-h-0 flex-1 cursor-pointer items-center gap-1 px-1 pb-1 text-left"
          onClick={() => onEntryClick(mainEntry.id)}
        >
          {mainEntry.coverUrl ? (
            <ImageComponent
              src={mainEntry.coverUrl}
              alt=""
              className="windows95-border h-12 w-8 shrink-0"
            />
          ) : (
            <span className="windows95-border bg-surface flex h-12 w-8 shrink-0 items-center justify-center">
              <Film className="text-hint size-3.5" aria-hidden />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="windows95-font line-clamp-2 text-xs leading-tight">
              {mainEntry.title}
            </span>
            {mainEntry.episode != null && (
              <span className="text-hint windows95-font text-[10px] leading-none">
                {t("anilist.activity.episode", { n: mainEntry.episode })}
              </span>
            )}
          </span>
        </button>
      )}
    </div>
  );
}
