import { cn } from "cn";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import {
  AIRING_TICK_MS,
  airingCountdownSecs,
  collectAiringRows,
  formatAiringCountdown,
  formatAiringLocal,
  groupAiringByDay,
} from "@/lib/anilist/airing.utils";
import { createInterval } from "@/lib/pacer/interval.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { AniListCollection } from "@/types/anilist";

export function AiringTab({
  lists,
  onAnimeClick,
}: {
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const [statusFilter, setStatusFilter] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const { cancel } = createInterval(() => setNowMs(Date.now()), AIRING_TICK_MS);
    return cancel;
  }, []);

  const statuses = useMemo(() => {
    const seen = new Set<string>();
    for (const list of lists) {
      for (const entry of list.entries) {
        if (entry.media.next_airing_at != null) seen.add(entry.list_status);
      }
    }
    return [...seen].sort();
  }, [lists]);

  const days = useMemo(
    () => groupAiringByDay(collectAiringRows(lists, statusFilter)),
    [lists, statusFilter]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
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
      </div>

      {days.length === 0 ? (
        <div className="flex items-center justify-center p-4">
          <span className="windows95-text text-hint text-xs">{t("anilist.airing.empty")}</span>
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
