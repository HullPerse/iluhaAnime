import Modal from "@/components/shared/modal.component";
import type { AniListCollection } from "@/types/anilist";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function StatsModal({
  lists,
  onClose,
  onAnimeClick,
}: {
  lists: AniListCollection[];
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}) {
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
      const dateEnd = dateStart + 86400;
      const dayEntries = allEntries.filter(
        (e) => e.airingAt >= dateStart && e.airingAt < dateEnd,
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
    selectedDay != null ? (calendarCells[selectedDay - 1]?.entries ?? []) : [];

  return (
    <Modal header="Календарь" onClose={onClose} className="w-3xl">
      {selectedDay != null ? (
        <main className="flex flex-col gap-2">
          <section className="flex items-center gap-2">
            <Button
              className="flex flex-row gap-1 items-center justify-center"
              onClick={() => setSelectedDay(null)}
            >
              <ChevronLeft /> Назад
            </Button>
            <span className="windows95-text text-xs font-bold">
              {selectedDay} {MONTH_LABELS[month]} {year}
            </span>
          </section>
          <section className="windows95-border bg-white min-h-80 overflow-y-auto">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 px-2 py-1 hover:bg-surface cursor-pointer border-b border-t-muted border-l-muted border-r-white border-b-white"
                onClick={() => onAnimeClick(entry.id)}
              >
                {entry.coverUrl && (
                  <ImageComponent
                    src={entry.coverUrl}
                    alt="coverUrl"
                    className="w-8 h-11 shrink-0 windows95-border"
                  />
                )}
                <span className="truncate flex-1 text-[11px] windows95-font">
                  {entry.title}
                </span>
                {entry.episode != null && (
                  <span className="text-muted shrink-0 text-[10px] windows95-font">
                    Эп. {entry.episode}
                  </span>
                )}
              </div>
            ))}
            {dayEntries.length === 0 && (
              <div className="flex items-center justify-center h-80 text-[11px] text-muted windows95-font">
                Нет релизов
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="flex flex-col">
          <div className="flex items-center justify-between px-1 mb-1 h-6">
            <Button
              onClick={prevMonth}
              size="icon"
              className="size-6"
              disabled={month === now.getMonth() && year === now.getFullYear()}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="windows95-text text-xs font-bold ">
              {MONTH_LABELS[month]} {year}
            </span>
            <Button onClick={nextMonth} size="icon" className="size-6">
              <ChevronRight className="size-3" />
            </Button>
          </div>

          <div className="windows95-border bg-white">
            <div className="grid grid-cols-7">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`text-[10px] font-bold windows95-font text-center p-1 border-r border-b border-t-muted border-l-muted ${
                    i >= 5 ? "text-destructive" : "text-text"
                  }`}
                >
                  {label}
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
                      className="h-26 border-r border-b border-t-muted border-l-muted bg-surface/30"
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
                    className={`relative h-26 border-r border-b border-t-muted border-l-muted flex flex-col overflow-hidden ${
                      isToday
                        ? "bg-secondary/10"
                        : isWeekend
                          ? "bg-surface/20"
                          : "bg-white"
                    }`}
                  >
                    <span
                      className={`text-[10px] leading-tight px-1 ${
                        isToday
                          ? "bg-secondary text-white font-bold rounded-none"
                          : isWeekend
                            ? "text-destructive font-bold"
                            : "text-text font-bold"
                      }`}
                    >
                      {day}
                    </span>
                    {mainEntry ? (
                      <div
                        className="flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer min-w-0"
                        onClick={() => onAnimeClick(mainEntry.id)}
                        title={mainEntry.title}
                      >
                        {mainEntry.coverUrl && (
                          <ImageComponent
                            src={mainEntry.coverUrl}
                            alt="coverUrl"
                            className="w-10 h-13 object-cover windows95-border"
                          />
                        )}
                        <span className="truncate text-[9px] windows95-font leading-tight text-center w-full px-1">
                          {mainEntry.title}
                        </span>
                        {mainEntry.episode != null && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[8px] windows95-font">
                              Эп. {mainEntry.episode}
                            </span>
                          </div>
                        )}
                        {cell.entries.length > 1 && (
                          <button
                            className="absolute top-0.5 right-0.5 size-5 flex flex-row items-center justify-center bg-secondary text-white border-black windows95-font text-[10px] hover:bg-secondary/80 hover:cursor-pointer"
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
      )}
    </Modal>
  );
}

export default StatsModal;
