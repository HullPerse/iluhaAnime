import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { monthLabel } from "@/lib/core/anilist/activity.utils";
import { currentAnimeSeason } from "@/lib/core/anilist/airing.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { buildMediaRows } from "@/lib/anilist/anilistStats.utils";
import { buildAiringEntries, buildCalendarCells, buildSeasonAiringEntries } from "@/lib/anilist/statsCalendar.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { ActivityDetailBundle, AniListCollection, AniMedia } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsCalendarMode, StatsTab } from "@/types/anilist/stats.anilist";
import type { StatsDrillData } from "@/types/core/overview.stats";

import { InlineDetail } from "@/routes/components/anilist/detail/inline.detail";
import { StatsModalContent } from "@/routes/components/anilist/stats/modal/content.modal";
import { TabButtons } from "@/routes/components/anilist/stats/modal/tabs.modal";

export default function StatsModal({
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
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<StatsTab>("overview");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [drill, setDrill] = useState<StatsDrillData | null>(null);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<null | number>(null);
  const [calendarMode, setCalendarMode] = useState<StatsCalendarMode>("list");
  const adult = useCell(settingsAtoms.anilistAdultContent);
  const lastTabRef = useRef<StatsTab>(tab);
  const season = currentAnimeSeason();
  const seasonQuery = useAppQuery<AniMedia[]>("slow", {
    queryKey: queryKeys.anilistSeasonAiring(season.season, season.year, adult),
    queryFn: () =>
      anilistApi.search({
        adult: adult ? null : false,
        maxPages: 4,
        perPage: 50,
        season: season.season,
        seasonYear: season.year,
        sort: ["POPULARITY_DESC"],
        status: "RELEASING",
      }),
    enabled: tab === "calendar" && calendarMode === "season",
  });

  useEffect(() => {
    if (lastTabRef.current === tab) return;
    lastTabRef.current = tab;
    setSelectedDay(null);
    setDrill(null);
  }, [tab]);

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
      return;
    }
    setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
      return;
    }
    setMonth((m) => m + 1);
  };

  const listEntries = useMemo(() => buildAiringEntries(lists), [lists]);
  const seasonEntries = useMemo(
    () => buildSeasonAiringEntries(seasonQuery.data ?? []),
    [seasonQuery.data]
  );
  const allEntries = calendarMode === "season" ? seasonEntries : listEntries;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = now.getDate();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
  const calendarCells = useMemo(
    () => buildCalendarCells(allEntries, year, month),
    [allEntries, year, month]
  );
  const drillRows = useMemo(
    () => (drill == null ? [] : buildMediaRows(drill.ids, lists)),
    [drill, lists]
  );
  const changeCalendarMode = (next: StatsCalendarMode) => {
    if (next === calendarMode) return;
    setCalendarMode(next);
    setSelectedDay(null);
    setDrill(null);
  };

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

  const dayTitle =
    tab === "calendar" && selectedDay != null
      ? `${selectedDay} ${monthLabel(month, locale, "long")} ${year}`
      : null;
  const drillTitle = drill == null || dayTitle != null ? null : drill.title;

  let backAction: (() => void) | undefined;
  if (dayTitle != null) {
    backAction = () => setSelectedDay(null);
  } else if (drillTitle != null) {
    backAction = () => setDrill(null);
  }

  const dayEntries = selectedDay == null ? [] : (calendarCells[selectedDay - 1]?.entries ?? []);

  return (
    <Modal
      header={dayTitle ?? drillTitle ?? t("anilist.stats.title")}
      onClose={onClose}
      onBack={backAction}
      className={dayTitle != null || drillTitle != null || tab !== "overview" ? "w-3xl" : "w-7xl"}
    >
      <TabButtons tab={tab} onTab={setTab} />
      <StatsModalContent
        tab={tab}
        drill={drill}
        drillRows={drillRows}
        scoreFormat={scoreFormat}
        lists={lists}
        userId={userId}
        selectedDay={selectedDay}
        dayEntries={dayEntries}
        month={month}
        year={year}
        firstDay={firstDay}
        daysInMonth={daysInMonth}
        calendarCells={calendarCells}
        calendarMode={calendarMode}
        isCurrentMonth={isCurrentMonth}
        seasonError={seasonQuery.isError}
        seasonLoading={seasonQuery.isLoading}
        today={today}
        onCalendarMode={changeCalendarMode}
        onOpenDetail={setDetailId}
        onSelectDay={setSelectedDay}
        onDrill={(data) => {
          setSelectedDay(null);
          setDrill(data);
        }}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        onRetrySeason={() => seasonQuery.refetch()}
      />
    </Modal>
  );
}
