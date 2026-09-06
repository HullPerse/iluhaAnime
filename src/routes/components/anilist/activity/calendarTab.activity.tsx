import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { CELL_GAP, CELL_LEVELS, CELL_SIZE } from "@/config/anilist/activity.config";
import { buildActivityMap, buildYearGrid, dayKey, monthLabel } from "@/lib/anilist/activity.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListCollection } from "@/types/anilist";

export function CalendarTab({
  lists,
  onAnimeClick,
}: {
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activity = useMemo(() => buildActivityMap(lists, t), [lists, t]);
  const grid = useMemo(() => buildYearGrid(year, activity), [year, activity]);

  const pitch = CELL_SIZE + CELL_GAP;

  const activeKey = selectedKey ?? hoverKey;
  const activeActivity = activeKey ? activity.get(activeKey) : undefined;

  const goPrevYear = () => setYear((y) => y - 1);
  const goNextYear = () => setYear((y) => Math.min(y + 1, now.getFullYear()));

  return (
    <div className="flex w-full flex-col gap-2">
      <section className="flex items-center justify-between px-1">
        <Button
          onClick={goPrevYear}
          size="icon"
          className="size-6"
          aria-label={t("anilist.activity.prev.year")}
        >
          <ChevronLeft className="size-3" />
        </Button>
        <span className="windows95-text text-xs font-bold">
          {year} - {t("anilist.activity.events.count", { count: grid.totalCount })}
        </span>
        <Button
          onClick={goNextYear}
          size="icon"
          className="size-6"
          disabled={year >= now.getFullYear()}
          aria-label={t("anilist.activity.next.year")}
        >
          <ChevronRight className="size-3" />
        </Button>
      </section>

      <div className="flex h-80 flex-col items-stretch gap-2 md:flex-row">
        <section className="windows95-border flex h-full min-w-0 flex-1 flex-col overflow-x-auto bg-white">
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <div className="relative mb-0.5 h-4">
              {grid.columns.map((col, ci) => {
                if (col.month === grid.columns[ci - 1]?.month) return null;
                return (
                  <span
                    key={`m${ci}`}
                    className="windows95-font text-text absolute top-0 truncate text-xs leading-4"
                    style={{
                      left: ci * pitch,
                      maxWidth: pitch * 2,
                    }}
                  >
                    {monthLabel(col.month, locale)}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-1">
              {grid.columns.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-1">
                  {col.cells.map((cell, r) => {
                    const isToday =
                      year === now.getFullYear() && cell.date.toDateString() === now.toDateString();
                    const key = dayKey(cell.date);
                    const isActive = key === activeKey;
                    return (
                      <button
                        type="button"
                        key={r}
                        aria-label={t("anilist.activity.day.summary", {
                          date: cell.date.toLocaleDateString(locale),
                          count: cell.count,
                        })}
                        className="shrink-0 cursor-pointer border border-black/20"
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          backgroundColor: CELL_LEVELS[cell.level] || undefined,
                          outline: isActive ? "1px solid var(--color-highlight)" : undefined,
                          outlineOffset: 1,
                          boxShadow: isToday ? "0 0 0 1px var(--color-secondary) inset" : undefined,
                        }}
                        onMouseEnter={() => cell.count > 0 && setHoverKey(dayKey(cell.date))}
                        onMouseLeave={() => setHoverKey(null)}
                        onClick={() => {
                          if (cell.count === 0) return;
                          setSelectedKey((prev) =>
                            prev === dayKey(cell.date) ? null : dayKey(cell.date)
                          );
                        }}
                        title={
                          cell.count > 0
                            ? `${cell.date.toLocaleDateString(locale)}: ${cell.count}`
                            : cell.date.toLocaleDateString(locale)
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="windows95-border flex h-full shrink-0 flex-col overflow-hidden bg-white md:w-64">
          {activeActivity ? (
            <div className="flex min-h-0 flex-col">
              <div className="border-muted/40 flex items-center justify-between border-b px-2 py-1">
                <span className="windows95-text text-xs font-bold">
                  {activeKey
                    ? new Date(
                        Number(activeKey.split("-")[0]),
                        Number(activeKey.split("-")[1]) - 1,
                        Number(activeKey.split("-")[2])
                      ).toLocaleDateString(locale)
                    : ""}
                </span>
                <Button
                  onClick={() => setSelectedKey(null)}
                  className="windows95-text px-1 py-0 text-xs"
                  variant="ghost"
                >
                  {t("common.close")}
                </Button>
              </div>
              <div className="border-muted/40 text-hint windows95-text flex flex-col gap-0.5 border-b px-2 py-0.5 text-xs">
                <span>
                  {t("anilist.activity.event.added")}: {activeActivity.added}
                </span>
                <span>
                  {t("anilist.activity.event.progress")}: {activeActivity.progress}
                </span>
                <span>
                  {t("anilist.activity.event.completed")}: {activeActivity.completed}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeActivity.items.map((item) => (
                  <div
                    key={item.id}
                    className="border-muted/40 hover:bg-surface flex cursor-pointer items-center gap-2 border-b px-2 py-1"
                    onClick={() => onAnimeClick(item.id)}
                  >
                    {item.cover && (
                      <ImageComponent
                        src={item.cover}
                        alt="cover"
                        className="windows95-border h-10 w-7 shrink-0"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="windows95-font truncate text-xs">{item.title}</span>
                      <span className="text-hint windows95-font text-xs">
                        {item.events}
                        {item.progress != null &&
                          ` - ${t("anilist.activity.episode", {
                            n: item.progress,
                          })}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-3">
              <span className="windows95-text text-hint text-center text-xs">
                {t("anilist.activity.day.hint")}
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
