import { cn } from "cn";
import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useMemo, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { TabLoader } from "@/components/shared/loader/tab.loader";
import { seasonLabels } from "@/config/system/labels.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import {
  AIRING_TICK_MS,
  airingCountdownSecs,
  collectAiringRows,
  currentAnimeSeason,
  formatAiringCountdown,
  formatAiringLocal,
  groupAiringByDay,
  seasonAiringRows,
} from "@/lib/core/anilist/airing.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { createInterval } from "@hullperse/hp_utils/interval";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { AniListCollection, AniMedia } from "@/types/anilist/anilist";

type AiringMode = "list" | "season";

export function AiringTab({
  lists,
  onAnimeClick,
}: {
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const adult = useCell(settingsAtoms.anilistAdultContent);
  const [mode, setMode] = useState<AiringMode>("list");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const season = currentAnimeSeason();

  useEffect(() => {
    const { cancel } = createInterval(() => setNowMs(Date.now()), AIRING_TICK_MS);
    return cancel;
  }, []);

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
    enabled: mode === "season",
  });

  const statuses = useMemo(() => {
    const seen = new Set<string>();
    for (const list of lists) {
      for (const entry of list.entries) {
        if (entry.media.next_airing_at != null) seen.add(entry.list_status);
      }
    }
    return [...seen].sort();
  }, [lists]);

  const rows = useMemo(
    () =>
      mode === "list"
        ? collectAiringRows(lists, statusFilter)
        : seasonAiringRows(seasonQuery.data ?? []),
    [lists, mode, seasonQuery.data, statusFilter]
  );
  const days = useMemo(() => groupAiringByDay(rows), [rows]);
  const loading = mode === "season" && seasonQuery.isLoading;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          variant={mode === "list" ? "outline" : "default"}
          className="h-5 px-1.5 text-xs"
          aria-pressed={mode === "list"}
          onClick={() => setMode("list")}
        >
          {t("anilist.airing.mode.list")}
        </Button>
        <Button
          variant={mode === "season" ? "outline" : "default"}
          className="h-5 px-1.5 text-xs"
          aria-pressed={mode === "season"}
          onClick={() => {
            setMode("season");
            setStatusFilter("");
          }}
        >
          {t("anilist.airing.mode.season")}
        </Button>
        {mode === "season" && (
          <span className="windows95-text text-hint text-xs">
            {t(seasonLabels[season.season] ?? "anilist.season.FALL")} {season.year}
          </span>
        )}
        {mode === "list" && (
          <>
            <Button
              className={cn(
                "windows95-text px-1.5 py-0.5 text-xs",
                statusFilter === ""
                  ? "windows95-active-border bg-secondary text-title-text"
                  : "windows95-border bg-field"
              )}
              variant="ghost"
              onClick={() => setStatusFilter("")}
            >
              {t("anilist.filters.any")}
            </Button>
            {statuses.map((status) => (
              <Button
                key={status}
                className={cn(
                  "windows95-text px-1.5 py-0.5 text-xs",
                  statusFilter === status
                    ? "windows95-active-border bg-secondary text-title-text"
                    : "windows95-border bg-field"
                )}
                variant="ghost"
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </>
        )}
      </div>

      {loading ? (
        <TabLoader className="min-h-24 p-4" />
      ) : mode === "season" && seasonQuery.isError ? (
        <div className="flex flex-col items-center justify-center gap-2 p-4">
          <span className="windows95-text text-hint text-xs">
            {t("anilist.airing.season.error")}
          </span>
          <Button
            className="windows95-text px-1.5 py-0.5 text-xs"
            variant="ghost"
            onClick={() => seasonQuery.refetch()}
          >
            {t("anilist.activity.retry")}
          </Button>
        </div>
      ) : days.length === 0 ? (
        <div className="flex items-center justify-center p-4">
          <span className="windows95-text text-hint text-xs">
            {mode === "season" ? t("anilist.airing.season.empty") : t("anilist.airing.empty")}
          </span>
        </div>
      ) : (
        days.map((day) => (
          <section key={day.dayStartMs} className="mt-1 flex flex-col gap-0.5">
            <span className="windows95-text text-hint text-xs font-bold">
              {new Date(day.dayStartMs).toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </span>
            <div className="flex flex-col gap-0.5">
              {day.rows.map((row) => {
                const secs = airingCountdownSecs(row.airingAt, nowMs);
                const countdown = formatAiringCountdown(secs, t);
                return (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-label={row.title}
                    data-vim-target="airing-item"
                    className="windows95-active-border bg-primary hover:bg-surface flex cursor-pointer items-center gap-2 px-1 py-1"
                    onClick={() => onAnimeClick(row.id)}
                    onKeyDown={enterOrSpace(() => onAnimeClick(row.id))}
                  >
                    {row.cover && (
                      <ImageComponent
                        src={row.cover}
                        alt="cover"
                        className="windows95-border h-10 w-7 shrink-0"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="windows95-font truncate text-xs font-bold">{row.title}</span>
                      <span className="text-hint windows95-font text-xs">
                        {row.episode != null
                          ? `${t("anilist.activity.episode", { n: row.episode })} - `
                          : ""}
                        {countdown
                          ? t("anilist.airing.in", { time: countdown })
                          : (formatAiringLocal(row.airingAt, locale) ?? t("anilist.airing.aired"))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
