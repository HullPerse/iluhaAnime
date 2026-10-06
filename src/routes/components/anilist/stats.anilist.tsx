import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useMemo } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { dayLabel, monthLabel } from "@/lib/anilist/activity.utils";
import { formatAiringTime } from "@/lib/anilist/airing.utils";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { formatDistanceToNowOwn } from "@/lib/utils/distance.utils";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import type { AniListCollection } from "@/types/anilist";

function StatsReleases({ onAnimeClick }: { onAnimeClick: (id: number) => void }) {
  const { t, locale } = useI18n();
  const releases = useAniListNotificationsStore((s) => s.releases);
  const markReleasesRead = useAniListNotificationsStore((s) => s.markReleasesRead);
  useEffect(() => {
    markReleasesRead();
  }, [markReleasesRead]);
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

function topEntries(counts: Map<string, number>, limit: number): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function StatsOverview({ lists }: { lists: AniListCollection[] }) {
  const { t } = useI18n();
  const summary = useMemo(() => {
    const byStatus = new Map<string, number>();
    const genres = new Map<string, number>();
    const studios = new Map<string, number>();
    let episodes = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let total = 0;
    for (const list of lists) {
      for (const entry of list.entries) {
        total += 1;
        byStatus.set(entry.list_status, (byStatus.get(entry.list_status) ?? 0) + 1);
        episodes += entry.progress ?? 0;
        if (entry.score != null) {
          scoreSum += entry.score;
          scoreCount += 1;
        }
        for (const genre of entry.media.genres) {
          genres.set(genre, (genres.get(genre) ?? 0) + 1);
        }
        for (const studio of entry.media.studios) {
          studios.set(studio.name, (studios.get(studio.name) ?? 0) + 1);
        }
      }
    }
    return {
      byStatus,
      episodes,
      mean: scoreCount > 0 ? scoreSum / scoreCount : null,
      topGenres: topEntries(genres, 8),
      topStudios: topEntries(studios, 8),
      total,
    };
  }, [lists]);

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-1">
      <div className="windows95-text flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
        <span>{t("anilist.stats.total.titles", { count: summary.total })}</span>
        <span>{t("anilist.stats.episodes.watched", { count: summary.episodes })}</span>
        {summary.mean != null && (
          <span>{t("anilist.stats.mean.score", { score: summary.mean.toFixed(1) })}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {[...summary.byStatus.entries()].map(([status, count]) => (
          <div key={status} className="flex items-center gap-2">
            <span
              className="inline-block size-3 shrink-0"
              style={{ background: getStatusColor(status) }}
              aria-hidden
            />
            <span className="windows95-text min-w-0 flex-1 truncate text-xs">
              {t(toLocaleKey(listStatusLabels[status] ?? status))}
            </span>
            <span className="windows95-text text-xs tabular-nums">{count}</span>
          </div>
        ))}
      </div>
      {summary.topGenres.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="windows95-text text-xs font-bold">{t("anilist.stats.top.genres")}</span>
          {summary.topGenres.map(([genre, count]) => (
            <div key={genre} className="flex items-center gap-2">
              <span className="windows95-text min-w-0 flex-1 truncate text-xs">{genre}</span>
              <span className="windows95-text text-xs tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      )}
      {summary.topStudios.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="windows95-text text-xs font-bold">{t("anilist.stats.top.studios")}</span>
          {summary.topStudios.map(([studio, count]) => (
            <div key={studio} className="flex items-center gap-2">
              <span className="windows95-text min-w-0 flex-1 truncate text-xs">{studio}</span>
              <span className="windows95-text text-xs tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [tab, setTab] = useState<"overview" | "calendar" | "released">("overview");
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
      const dayEntries = allEntries.filter((e) => e.airingAt >= dateStart && e.airingAt < dateEnd);
      cells.push({ date: d, entries: dayEntries });
    }
    return cells;
  }, [allEntries, year, month, daysInMonth]);

  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const today = now.getDate();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;

  const dayEntries = selectedDay == null ? [] : (calendarCells[selectedDay - 1]?.entries ?? []);

  return (
    <Modal header={t("anilist.stats.title")} onClose={onClose} className="w-3xl">
      <div className="mb-1 flex gap-1">
        <Button
          variant={tab === "overview" ? "outline" : "default"}
          className="h-6 text-xs"
          onClick={() => setTab("overview")}
        >
          {t("anilist.stats.overview")}
        </Button>
        <Button
          variant={tab === "calendar" ? "outline" : "default"}
          className="h-6 text-xs"
          onClick={() => setTab("calendar")}
        >
          {t("anilist.stats.calendar")}
        </Button>
        <Button
          variant={tab === "released" ? "outline" : "default"}
          className="h-6 text-xs"
          onClick={() => setTab("released")}
        >
          {t("anilist.stats.released")}
        </Button>
      </div>
      {tab === "overview" ? (
        <StatsOverview lists={lists} />
      ) : tab === "released" ? (
        <StatsReleases onAnimeClick={onAnimeClick} />
      ) : selectedDay == null ? (
        <div className="flex flex-col">
          <div className="mb-1 flex h-6 items-center justify-between px-1">
            <Button
              onClick={prevMonth}
              size="icon"
              className="size-6"
              aria-label={t("common.previous")}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="windows95-text text-xs font-bold">
              {monthLabel(month, locale, "long")} {year}
            </span>
            <Button
              onClick={nextMonth}
              size="icon"
              className="size-6"
              aria-label={t("common.next")}
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>

          <div className="windows95-border bg-field">
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
                        <span className="windows95-font w-full truncate px-1 text-center text-xs leading-tight">
                          {mainEntry.title}
                        </span>
                        {mainEntry.episode != null && (
                          <div className="flex items-center gap-1">
                            <span className="text-hint windows95-font text-xs">
                              {t("anilist.activity.episode", {
                                n: mainEntry.episode,
                              })}
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
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
          <section className="windows95-border bg-field min-h-80 overflow-y-auto">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="hover:bg-surface border-t-muted border-l-muted border-r-win-highlight border-b-win-highlight flex cursor-pointer items-center gap-2 border-b px-2 py-1"
                onClick={() => onAnimeClick(entry.id)}
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
        </div>
      )}
    </Modal>
  );
}

export default StatsModal;
