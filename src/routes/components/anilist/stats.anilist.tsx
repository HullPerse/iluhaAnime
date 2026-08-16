import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { monthLabel } from "@/lib/activity.anilist.utils";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/types";
import type { AniListCollection } from "@/types/anilist";

import PersonalStats from "./stats.personal";

function dayLabel(day: number, locale: Locale): string {
  return new Date(2024, 0, day + 1).toLocaleDateString(locale, {
    weekday: "short",
  });
}

function StatsModal({
  lists,
  onClose,
  onAnimeClick,
}: {
  lists: AniListCollection[];
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<null | number>(null);

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  };

  const allEntries = useMemo(() => {
    const result: {
      id: number;
      title: string;
      airingAt: number;
      episode: number | null;
      coverUrl: string | null;
    }[] = [];
    for (const list of lists) {
      for (const entry of list.entries) {
        const at = entry.media.next_airing_at;
        if (!at) continue;
        result.push({
          id: entry.media.id,
          title: entry.media.title,
          airingAt: at,
          episode: entry.media.next_episode,
          coverUrl: entry.media.cover_url,
        });
      }
    }
    result.sort((a, b) => a.airingAt - b.airingAt);
    return result;
  }, [lists]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

  const calendarCells = useMemo(() => {
    const cells: { date: number; entries: typeof allEntries }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStart = Math.floor(new Date(year, month, d).getTime() / 1000);
      const dateEnd = dateStart + 86_400;
      const dayEntries = allEntries.filter(
        (e) => e.airingAt >= dateStart && e.airingAt < dateEnd
      );
      cells.push({ date: d, entries: dayEntries });
    }
    return cells;
  }, [allEntries, year, month, daysInMonth]);

  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const today = now.getDate();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;

  const dayEntries =
    selectedDay == null ? [] : (calendarCells[selectedDay - 1]?.entries ?? []);

  return (
    <Modal
      header={t("anilist.stats.title")}
      onClose={onClose}
      className="w-3xl"
    >
      <PersonalStats lists={lists} />
      {selectedDay == null ? (
        <main className="flex flex-col">
          <div className="mb-1 flex h-6 items-center justify-between px-1">
            <Button
              onClick={prevMonth}
              size="icon"
              className="size-6"
              disabled={month === now.getMonth() && year === now.getFullYear()}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="windows95-text text-xs font-bold">
{monthLabel(month, locale, "long")} {year}
            </span>
            <Button onClick={nextMonth} size="icon" className="size-6">
              <ChevronRight className="size-3" />
            </Button>
          </div>

          <div className="windows95-border bg-white">
            <div className="grid grid-cols-7">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`windows95-font border-t-muted border-l-muted border-r border-b p-1 text-center text-[10px] font-bold ${
                    i >= 5 ? "text-destructive" : "text-text"
                  }`}
                >
                  {dayLabel(i, locale)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: rows * 7 }).map((_, idx) => {
                const day = idx - firstDay + 1;
                if (day < 1 || day > daysInMonth) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="border-t-muted border-l-muted bg-surface/30 h-26 border-r border-b"
                    />
                  );
                }
                const cell = calendarCells[day - 1];
                const isToday = isCurrentMonth && day === today;
                const isWeekend = idx % 7 >= 5;
                const mainEntry = cell.entries[0];

                return (
                  <div
                    key={day}
                    className={`border-t-muted border-l-muted relative flex h-26 flex-col overflow-hidden border-r border-b ${
                      isToday
                        ? "bg-secondary/10"
                        : isWeekend
                          ? "bg-surface/20"
                          : "bg-white"
                    }`}
                  >
                    <span
                      className={`px-1 text-[10px] leading-tight ${
                        isToday
                          ? "bg-secondary font-bold text-white"
                          : isWeekend
                            ? "text-destructive font-bold"
                            : "text-text font-bold"
                      }`}
                    >
                      {day}
                    </span>
                    {mainEntry ? (
                      <div
                        className="flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1"
                        onClick={() => onAnimeClick(mainEntry.id)}
                        title={mainEntry.title}
                      >
                        {mainEntry.coverUrl && (
                          <ImageComponent
                            src={mainEntry.coverUrl}
                            alt="coverUrl"
                            className="windows95-border h-13 w-10 object-cover"
                          />
                        )}
                        <span className="windows95-font w-full truncate px-1 text-center text-[9px] leading-tight">
                          {mainEntry.title}
                        </span>
                        {mainEntry.episode != null && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted windows95-font text-[8px]">
                              {t("anilist.activity.episode", {
                                n: mainEntry.episode,
                              })}
                            </span>
                          </div>
                        )}
                        {cell.entries.length > 1 && (
                          <button
                            type="button"
                            aria-label={t("anilist.stats.moreReleases", {
                              count: cell.entries.length,
                              date: `${day} ${monthLabel(month, locale, "long")} ${year}`,
                            })}
                            className="bg-secondary windows95-font hover:bg-secondary/80 absolute top-0.5 right-0.5 flex size-5 flex-row items-center justify-center border-black text-[10px] text-white hover:cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDay(day);
                            }}
                          >
                            <span>+</span>
                            <span>{cell.entries.length - 1}</span>
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      ) : (
        <main className="flex flex-col gap-2">
          <section className="flex items-center gap-2">
            <Button
              className="flex flex-row items-center justify-center gap-1"
              onClick={() => setSelectedDay(null)}
            >
              <ChevronLeft /> {t("anilist.stats.back")}
            </Button>
            <span className="windows95-text text-xs font-bold">
              {selectedDay} {monthLabel(month, locale, "long")} {year}
            </span>
          </section>
          <section className="windows95-border min-h-80 overflow-y-auto bg-white">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="hover:bg-surface border-t-muted border-l-muted flex cursor-pointer items-center gap-2 border-b border-r-white border-b-white px-2 py-1"
                onClick={() => onAnimeClick(entry.id)}
              >
                {entry.coverUrl && (
                  <ImageComponent
                    src={entry.coverUrl}
                    alt="coverUrl"
                    className="windows95-border h-11 w-8 shrink-0"
                  />
                )}
                <span className="windows95-font flex-1 truncate text-[11px]">
                  {entry.title}
                </span>
                {entry.episode != null && (
                  <span className="text-muted windows95-font shrink-0 text-[10px]">
                    {t("anilist.activity.episode", { n: entry.episode })}
                  </span>
                )}
              </div>
            ))}
            {dayEntries.length === 0 && (
              <div className="text-muted windows95-font flex h-80 items-center justify-center text-[11px]">
                {t("anilist.stats.noReleases")}
              </div>
            )}
          </section>
        </main>
      )}
    </Modal>
  );
}

export default StatsModal;
