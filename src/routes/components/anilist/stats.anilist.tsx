import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useMemo } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { dayLabel, monthLabel } from "@/lib/anilist/activity.utils";
import { formatAiringTime } from "@/lib/anilist/airing.utils";
import { buildMediaRows } from "@/lib/anilist/stats.utils";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import { useCell } from "@/lib/state/signal.hook";
import { formatDistanceToNowOwn } from "@/lib/utils/distance.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { anilistNotificationsAtoms, markAnilistReleasesRead } from "@/store/anilist.store";
import type { ActivityDetailBundle } from "@/types/anilist";
import type { AniListCollection } from "@/types/anilist";
import type { Locale } from "@/types/i18n";

import { InlineDetail } from "./detail/inline.detail";
import { MediaRows } from "./stats/mediaRows.stats";
import { StatsOverview } from "./stats/overview.stats";
import type { StatsDrillData } from "./stats/overview.stats";

function StatsReleases({ onAnimeClick }: { onAnimeClick: (id: number) => void }) {
  const { t, locale } = useI18n();
  const releases = useCell(anilistNotificationsAtoms.releases);
  useEffect(() => {
    markAnilistReleasesRead();
  }, []);
  if (releases.length === 0) {
    return (
      <span className="windows95-text text-hint p-3 text-center text-xs">
        {t("anilist.stats.released.empty")}
      </span>
    );
  }
  return (
    <div className="flex max-h-96 flex-col gap-1 overflow-y-auto p-1">
      {releases.map((release) => (
        <button
          key={`${release.mediaId}:${release.episode}`}
          type="button"
          onClick={() => onAnimeClick(release.mediaId)}
          className="windows95-border bg-primary hover:bg-surface flex w-full cursor-pointer items-center gap-2 px-1 py-0.5 text-left"
        >
          <span className="windows95-text min-w-0 flex-1 truncate text-xs">
            <span className="font-bold">{release.title}</span>{" "}
            <span className="text-hint">
              {t("anilist.activity.episode", { n: release.episode })}
            </span>
          </span>
          <span className="text-hint windows95-font shrink-0 text-xs">
            {formatDistanceToNowOwn(release.airedAt, locale)}
          </span>
        </button>
      ))}
    </div>
  );
}

function TabButtons({
  tab,
  onTab,
  t,
}: {
  tab: "overview" | "calendar" | "released";
  onTab: (next: typeof tab) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="mb-1 flex gap-1">
      <Button
        variant={tab === "overview" ? "outline" : "default"}
        className="h-6 text-xs"
        onClick={() => onTab("overview")}
      >
        {t("anilist.stats.overview")}
      </Button>
      <Button
        variant={tab === "calendar" ? "outline" : "default"}
        className="h-6 text-xs"
        onClick={() => onTab("calendar")}
      >
        {t("anilist.stats.calendar")}
      </Button>
      <Button
        variant={tab === "released" ? "outline" : "default"}
        className="h-6 text-xs"
        onClick={() => onTab("released")}
      >
        {t("anilist.stats.released")}
      </Button>
    </div>
  );
}

function CalendarHeader({
  month,
  year,
  locale,
  onPrev,
  onNext,
  t,
}: {
  month: number;
  year: number;
  locale: Locale;
  onPrev: () => void;
  onNext: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="mb-1 flex h-6 items-center justify-between px-1">
      <Button onClick={onPrev} size="icon" className="size-6" aria-label={t("common.previous")}>
        <ChevronLeft className="size-3" />
      </Button>
      <span className="windows95-text text-xs font-bold">
        {monthLabel(month, locale, "long")} {year}
      </span>
      <Button onClick={onNext} size="icon" className="size-6" aria-label={t("common.next")}>
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}

function CalendarDayHeader({ locale }: { locale: Locale }) {
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

type AiringEntry = {
  id: number;
  title: string;
  airingAt: number;
  episode: number | null;
  coverUrl: string | null;
};

function CalendarDayCell({
  day,
  cell,
  isToday,
  isWeekend,
  onEntryClick,
  onMoreClick,
  t,
  month,
  year,
  locale,
}: {
  day: number;
  cell: { date: number; entries: AiringEntry[] } | undefined;
  isToday: boolean;
  isWeekend: boolean;
  onEntryClick: (id: number) => void;
  onMoreClick: (day: number) => void;
  t: ReturnType<typeof useI18n>["t"];
  month: number;
  year: number;
  locale: Locale;
}) {
  const mainEntry = cell?.entries[0];
  return (
    <div
      className={cn(
        "border-t-muted border-l-muted relative flex h-26 flex-col overflow-hidden border-r border-b",
        isToday ? "bg-secondary/10" : isWeekend ? "bg-surface/20" : "bg-field"
      )}
    >
      <span
        className={cn(
          "px-1 text-xs leading-tight",
          isToday
            ? "bg-secondary text-title-text font-bold"
            : isWeekend
              ? "text-destructive font-bold"
              : "text-text font-bold"
        )}
      >
        {day}
      </span>
      {mainEntry ? (
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
          {cell.entries.length > 1 && (
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
      ) : null}
    </div>
  );
}

function CalendarGrid({
  firstDay,
  daysInMonth,
  calendarCells,
  isCurrentMonth,
  today,
  onEntryClick,
  onDayClick,
  t,
  month,
  year,
  locale,
}: {
  firstDay: number;
  daysInMonth: number;
  calendarCells: { date: number; entries: AiringEntry[] }[];
  isCurrentMonth: boolean;
  today: number;
  onEntryClick: (id: number) => void;
  onDayClick: (day: number) => void;
  t: ReturnType<typeof useI18n>["t"];
  month: number;
  year: number;
  locale: Locale;
}) {
  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  return (
    <div className="windows95-border bg-field">
      <CalendarDayHeader locale={locale} />
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
          return (
            <CalendarDayCell
              key={day}
              day={day}
              cell={cell}
              isToday={isToday}
              isWeekend={isWeekend}
              onEntryClick={onEntryClick}
              onMoreClick={onDayClick}
              t={t}
              month={month}
              year={year}
              locale={locale}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayEntriesList({
  dayEntries,
  locale,
  onEntryClick,
  t,
}: {
  dayEntries: AiringEntry[];
  locale: Locale;
  onEntryClick: (id: number) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <section className="windows95-border bg-field min-h-80 overflow-y-auto">
      {dayEntries.map((entry) => (
        <div
          key={entry.id}
          role="button"
          tabIndex={0}
          aria-label={entry.title}
          data-vim-target="stats-entry"
          className="hover:bg-surface border-t-muted border-l-muted border-r-win-highlight border-b-win-highlight flex cursor-pointer items-center gap-2 border-b px-2 py-1"
          onClick={() => onEntryClick(entry.id)}
          onKeyDown={enterOrSpace(() => onEntryClick(entry.id))}
        >
          {entry.coverUrl && (
            <ImageComponent
              src={entry.coverUrl}
              alt="coverUrl"
              className="windows95-border h-11 w-8 shrink-0"
            />
          )}
          <span className="windows95-font flex-1 truncate text-xs">{entry.title}</span>
          <span className="text-hint windows95-font shrink-0 text-xs">
            {formatAiringTime(entry.airingAt, locale)}
          </span>
          {entry.episode != null && (
            <span className="text-hint windows95-font shrink-0 text-xs">
              {t("anilist.activity.episode", { n: entry.episode })}
            </span>
          )}
        </div>
      ))}
      {dayEntries.length === 0 && (
        <div className="text-hint windows95-font flex h-80 items-center justify-center text-xs">
          {t("anilist.stats.no.releases")}
        </div>
      )}
    </section>
  );
}

function StatsModal({
  lists,
  userId,
  scoreFormat,
  onClose,
  detail,
}: {
  lists: AniListCollection[];
  userId: number | null;
  scoreFormat: AnilistScoreFormat;
  onClose: () => void;
  detail: ActivityDetailBundle;
}) {
  const { t, locale } = useI18n();
  const now = new Date();
  const [tab, setTab] = useState<"overview" | "calendar" | "released">("overview");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [drill, setDrill] = useState<StatsDrillData | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<null | number>(null);

  const openTab = (next: typeof tab) => {
    setTab(next);
    setSelectedDay(null);
    setDrill(null);
  };

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
  const today = now.getDate();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;

  const calendarCells = useMemo(() => {
    const cells: { date: number; entries: typeof allEntries }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStart = Math.floor(new Date(year, month, d).getTime() / 1000);
      const dateEnd = dateStart + 86_400;
      const dayEntries = allEntries.filter((e) => e.airingAt >= dateStart && e.airingAt < dateEnd);
      cells.push({ date: d, entries: dayEntries });
    }
    return cells;
  }, [allEntries, year, month, daysInMonth]);

  const drillRows = useMemo(
    () => (drill == null ? [] : buildMediaRows(drill.ids, lists)),
    [drill, lists]
  );
  const dayTitle =
    tab === "calendar" && selectedDay != null
      ? `${selectedDay} ${monthLabel(month, locale, "long")} ${year}`
      : null;
  const drillTitle = drill == null || dayTitle != null ? null : drill.title;

  if (detailId != null) {
    return (
      <InlineDetail
        initialId={detailId}
        detail={detail}
        onBack={() => setDetailId(null)}
        onClose={onClose}
      />
    );
  }

  const dayEntries = selectedDay == null ? [] : (calendarCells[selectedDay - 1]?.entries ?? []);

  const backAction =
    dayTitle != null
      ? () => setSelectedDay(null)
      : drillTitle != null
        ? () => setDrill(null)
        : undefined;

  return (
    <Modal
      header={dayTitle ?? drillTitle ?? t("anilist.stats.title")}
      onClose={onClose}
      onBack={backAction}
      className={dayTitle != null || drillTitle != null || tab !== "overview" ? "w-3xl" : "w-7xl"}
    >
      <TabButtons tab={tab} onTab={openTab} t={t} />
      {renderModalContent(
        tab,
        drill,
        drillRows,
        scoreFormat,
        lists,
        userId,
        selectedDay,
        dayEntries,
        setDetailId,
        setSelectedDay,
        setDrill,
        prevMonth,
        nextMonth,
        t,
        locale,
        month,
        year,
        firstDay,
        daysInMonth,
        calendarCells,
        isCurrentMonth,
        today,
      )}
    </Modal>
  );
}

function renderModalContent(
  tab: "overview" | "calendar" | "released",
  drill: StatsDrillData | null,
  drillRows: ReturnType<typeof buildMediaRows>,
  scoreFormat: AnilistScoreFormat,
  lists: AniListCollection[],
  userId: number | null,
  selectedDay: number | null,
  dayEntries: AiringEntry[],
  setDetailId: (id: number) => void,
  setSelectedDay: (day: number | null) => void,
  setDrill: (data: StatsDrillData) => void,
  onPrevMonth: () => void,
  onNextMonth: () => void,
  t: ReturnType<typeof useI18n>["t"],
  locale: Locale,
  month: number,
  year: number,
  firstDay: number,
  daysInMonth: number,
  calendarCells: { date: number; entries: AiringEntry[] }[],
  isCurrentMonth: boolean,
  today: number,
) {
  if (drill != null) {
    return (
      <MediaRows rows={drillRows} scoreFormat={scoreFormat} onOpen={setDetailId} />
    );
  }
  if (tab === "overview") {
    return (
      <StatsOverview
        userId={userId}
        scoreFormat={scoreFormat}
        lists={lists}
        onDrill={(data) => {
          setSelectedDay(null);
          setDrill(data);
        }}
      />
    );
  }
  if (tab === "released") {
    return <StatsReleases onAnimeClick={setDetailId} />;
  }
  if (selectedDay == null) {
    return (
      <div className="flex flex-col">
        <CalendarHeader
          month={month}
          year={year}
          locale={locale}
          onPrev={onPrevMonth}
          onNext={onNextMonth}
          t={t}
        />
        <CalendarGrid
          firstDay={firstDay}
          daysInMonth={daysInMonth}
          calendarCells={calendarCells}
          isCurrentMonth={isCurrentMonth}
          today={today}
          onEntryClick={setDetailId}
          onDayClick={setSelectedDay}
          t={t}
          month={month}
          year={year}
          locale={locale}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <DayEntriesList
        dayEntries={dayEntries}
        locale={locale}
        onEntryClick={setDetailId}
        t={t}
      />
    </div>
  );
}

export default StatsModal;
