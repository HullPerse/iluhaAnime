import type { CalendarCell } from "@/types/anilist/stats.anilist";

import { CalendarDayCell } from "@/routes/components/anilist/stats/modal/calendarDayCell.modal";
import { CalendarDayHeader } from "@/routes/components/anilist/stats/modal/calendarDayHeader.modal";

export function CalendarGrid({
  firstDay,
  daysInMonth,
  calendarCells,
  isCurrentMonth,
  today,
  onEntryClick,
  onDayClick,
  month,
  year,
}: {
  firstDay: number;
  daysInMonth: number;
  calendarCells: CalendarCell[];
  isCurrentMonth: boolean;
  today: number;
  onEntryClick: (id: number) => void;
  onDayClick: (day: number) => void;
  month: number;
  year: number;
}) {
  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  return (
    <div className="windows95-border bg-field">
      <CalendarDayHeader />
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
          return (
            <CalendarDayCell
              key={day}
              day={day}
              cell={calendarCells[day - 1]}
              isToday={isCurrentMonth && day === today}
              isWeekend={idx % 7 >= 5}
              onEntryClick={onEntryClick}
              onMoreClick={onDayClick}
              month={month}
              year={year}
            />
          );
        })}
      </div>
    </div>
  );
}
