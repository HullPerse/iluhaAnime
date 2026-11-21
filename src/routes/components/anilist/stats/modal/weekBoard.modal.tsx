import { Film } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatAiringTime } from "@/lib/core/anilist/airing.utils";
import { LOCAL_TIME_ZONE } from "@/lib/core/text/time.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { CalendarWeekDay } from "@/types/anilist/stats.anilist";

export function WeekBoard({
  weekDays,
  onEntryClick,
}: {
  weekDays: CalendarWeekDay[];
  onEntryClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <section
      aria-label={t("anilist.stats.calendar.week.board")}
      className="windows95-border bg-field max-h-[62vh] min-h-48 overflow-auto"
    >
      <div className="grid min-w-[48rem] grid-cols-7">
        {weekDays.map((day) => {
          const date = new Date(day.dayStartMs);
          const isToday = day.dayStartMs === today.getTime();
          return (
            <section
              key={day.dayStartMs}
              aria-label={date.toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: LOCAL_TIME_ZONE,
              })}
              aria-current={isToday ? "date" : undefined}
              className={
                isToday
                  ? "border-r-muted bg-secondary/10 min-w-0 border-r last:border-r-0"
                  : "border-r-muted bg-field min-w-0 border-r last:border-r-0"
              }
            >
              <header className="border-b-muted bg-primary sticky top-0 z-10 flex flex-col items-center gap-0.5 border-b px-1 py-1.5 text-center">
                <span className="windows95-font w-full truncate text-[10px] font-bold uppercase">
                  {date.toLocaleDateString(locale, {
                    weekday: "long",
                    timeZone: LOCAL_TIME_ZONE,
                  })}
                </span>
                <span className="windows95-text text-hint w-full truncate text-[10px] uppercase">
                  {date.toLocaleDateString(locale, {
                    day: "numeric",
                    month: "long",
                    timeZone: LOCAL_TIME_ZONE,
                  })}
                </span>
              </header>
              <div className="flex flex-col gap-1 p-1">
                {day.entries.map((entry) => {
                  const time = formatAiringTime(entry.airingAt, locale);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-label={entry.title}
                      title={entry.title}
                      data-vim-target="stats-entry"
                      className="windows95-border bg-primary hover:bg-surface focus-visible:bg-surface flex w-full min-w-0 cursor-pointer flex-col p-0.5 text-left"
                      onClick={() => onEntryClick(entry.id)}
                      onKeyDown={enterOrSpace(() => onEntryClick(entry.id))}
                    >
                      {entry.coverUrl ? (
                        <ImageComponent
                          src={entry.coverUrl}
                          alt=""
                          width={2}
                          height={3}
                          className="windows95-border w-full"
                        />
                      ) : (
                        <span className="windows95-border bg-surface flex aspect-[2/3] w-full items-center justify-center">
                          <Film className="text-hint size-4" aria-hidden />
                        </span>
                      )}
                      <span className="windows95-font mt-1 line-clamp-2 h-[2.5em] text-[11px] leading-tight font-bold">
                        {entry.title}
                      </span>
                      <span className="text-hint windows95-font mt-0.5 flex h-[1.3em] min-w-0 items-center gap-x-1 overflow-hidden text-[10px] leading-tight whitespace-nowrap">
                        {entry.episode != null && (
                          <span className="shrink-0">
                            {t("anilist.activity.episode", { n: entry.episode })}
                          </span>
                        )}
                        {time != null && <span className="truncate">{time}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
