import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { seasonLabels } from "@/config/system/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { currentAnimeSeason } from "@/lib/core/anilist/airing.utils";
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
  calendarMode,
  isCurrentMonth,
  seasonError,
  seasonLoading,
  today,
  onCalendarMode,
  onOpenDetail,
  onSelectDay,
  onDrill,
  onPrevMonth,
  onNextMonth,
  onRetrySeason,
}: StatsModalContentProps) {
  const { t } = useI18n();
  const season = currentAnimeSeason();
  if (drill != null) {
    return <MediaRows rows={drillRows} scoreFormat={scoreFormat} onOpen={onOpenDetail} />;
  }
  if (tab === "overview") {
    return (
      <StatsOverview userId={userId} scoreFormat={scoreFormat} lists={lists} onDrill={onDrill} />
    );
  }
  if (tab === "released") {
    return <StatsReleases onAnimeClick={onOpenDetail} lists={lists} />;
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
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <Button
          variant={calendarMode === "list" ? "outline" : "default"}
          className="h-5 px-1.5 text-xs"
          aria-pressed={calendarMode === "list"}
          onClick={() => onCalendarMode("list")}
        >
          {t("anilist.airing.mode.list")}
        </Button>
        <Button
          variant={calendarMode === "season" ? "outline" : "default"}
          className="h-5 px-1.5 text-xs"
          aria-pressed={calendarMode === "season"}
          onClick={() => onCalendarMode("season")}
        >
          {t("anilist.airing.mode.season")}
        </Button>
        {calendarMode === "season" && (
          <span className="windows95-text text-hint text-xs">
            {t(seasonLabels[season.season] ?? "anilist.season.FALL")} {season.year}
          </span>
        )}
      </div>
      {calendarMode === "season" && seasonLoading ? (
        <TabLoader className="min-h-24 p-4" />
      ) : calendarMode === "season" && seasonError ? (
        <div className="flex flex-col items-center justify-center gap-2 p-4">
          <span className="windows95-text text-hint text-xs">
            {t("anilist.airing.season.error")}
          </span>
          <Button className="h-5 px-1.5 text-xs" onClick={onRetrySeason}>
            {t("anilist.activity.retry")}
          </Button>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
