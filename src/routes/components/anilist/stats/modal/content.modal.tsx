import type { StatsModalContentProps } from "@/types/anilist/stats.anilist";

import { MediaRows } from "@/routes/components/anilist/stats/mediaRows.stats";
import { StatsOverview } from "@/routes/components/anilist/stats/overview.stats";
import { CalendarGrid } from "@/routes/components/anilist/stats/modal/calendarGrid.modal";
import { CalendarHeader } from "@/routes/components/anilist/stats/modal/calendarHeader.modal";
import { DayEntriesList } from "@/routes/components/anilist/stats/modal/dayEntries.modal";
import { StatsReleases } from "@/routes/components/anilist/stats/modal/releases.modal";

export function StatsModalContent({
  tab,
  drill,
  drillRows,
  scoreFormat,
  lists,
  userId,
  selectedDay,
  dayEntries,
  month,
  year,
  firstDay,
  daysInMonth,
  calendarCells,
  isCurrentMonth,
  today,
  onOpenDetail,
  onSelectDay,
  onDrill,
  onPrevMonth,
  onNextMonth,
}: StatsModalContentProps) {
  if (drill != null) {
    return <MediaRows rows={drillRows} scoreFormat={scoreFormat} onOpen={onOpenDetail} />;
  }
  if (tab === "overview") {
    return (
      <StatsOverview userId={userId} scoreFormat={scoreFormat} lists={lists} onDrill={onDrill} />
    );
  }
  if (tab === "released") {
    return <StatsReleases onAnimeClick={onOpenDetail} />;
  }
  if (selectedDay != null) {
    return (
      <div className="flex flex-col gap-2">
        <DayEntriesList dayEntries={dayEntries} onEntryClick={onOpenDetail} />
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <CalendarHeader month={month} year={year} onPrev={onPrevMonth} onNext={onNextMonth} />
      <CalendarGrid
        firstDay={firstDay}
        daysInMonth={daysInMonth}
        calendarCells={calendarCells}
        isCurrentMonth={isCurrentMonth}
        today={today}
        onEntryClick={onOpenDetail}
        onDayClick={onSelectDay}
        month={month}
        year={year}
      />
    </div>
  );
}
