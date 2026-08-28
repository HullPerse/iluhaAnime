import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Check,
  X,
  Bookmark,
  RotateCcw,
  Pause,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
} from "lucide-react";
import { useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { CELL_GAP, CELL_LEVELS, CELL_SIZE } from "@/config/activity.config";
import {
  buildActivityMap,
  buildYearGrid,
  dayKey,
  formatActivityTime,
  groupLabel,
  monthLabel,
} from "@/lib/activity.utils";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import type { AniActivity, AniListCollection } from "@/types/anilist";

const STATUS_ICONS: Record<string, typeof Play> = {
  CURRENT: Play,
  COMPLETED: Check,
  DROPPED: X,
  PLANNING: Bookmark,
  PAUSED: Pause,
  REPEATING: RotateCcw,
};

const STATUS_LABELS: Record<string, string> = {
  CURRENT: "anilist.activity.status.CURRENT",
  COMPLETED: "anilist.activity.status.COMPLETED",
  DROPPED: "anilist.activity.status.DROPPED",
  PLANNING: "anilist.activity.status.PLANNING",
  PAUSED: "anilist.activity.status.PAUSED",
  REPEATING: "anilist.activity.status.REPEATING",
};

const STATUS_FILTERS: { value: string; key: TranslationKey }[] = [
  { value: "", key: "anilist.activity.filterAll" },
  { value: "CURRENT", key: "anilist.activity.filterCurrent" },
  { value: "COMPLETED", key: "anilist.activity.filterCompleted" },
  { value: "DROPPED", key: "anilist.activity.filterDropped" },
  { value: "PAUSED", key: "anilist.activity.filterPaused" },
  { value: "PLANNING", key: "anilist.activity.filterPlanning" },
  { value: "REPEATING", key: "anilist.activity.filterRepeating" },
];

function FeedItem({
  a,
  onAnimeClick,
}: {
  a: AniActivity;
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const Icon = STATUS_ICONS[a.status ?? ""];

  if (a.activity_type !== "list" || !a.media_id) {
    return (
      <div className="windows95-active-border bg-primary flex flex-row items-start gap-2 px-1 py-1">
        {a.user_avatar ? (
          <ImageComponent
            src={a.user_avatar}
            alt="user_avatar"
            className="windows95-active-border h-7 w-7 shrink-0"
          />
        ) : (
          <div className="windows95-active-border flex h-7 w-7 shrink-0 items-center justify-center bg-white text-xs font-bold">
            {a.user_name[0] ?? "?"}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="windows95-text text-xs">
            <span className="font-bold">{a.user_name}</span>{" "}
            <span className="text-hint">{t("anilist.activity.note")}</span>{" "}
            {a.text}
          </span>
          <span className="text-hint text-xs">
            {formatActivityTime(a.created_at, t, locale)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="windows95-active-border bg-primary flex flex-row items-center gap-2 px-1 py-1">
      {a.media_cover && (
        <ImageComponent
          src={a.media_cover}
          alt="media_cover"
          className="windows95-active-border h-16 w-11 shrink-0 object-cover hover:cursor-pointer"
          onClick={() => onAnimeClick(a.media_id!)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="windows95-text text-xs">
          {a.user_name && (
            <>
              <span className="font-bold">{a.user_name}</span>{" "}
            </>
          )}
          {Icon && <Icon className="inline size-2.5" />}{" "}
          {t(
            (STATUS_LABELS[a.status ?? ""] ?? a.status ?? "") as TranslationKey
          )}{" "}
        </span>
        <span
          className="windows95-text line-clamp-2 text-xs font-bold underline decoration-dotted hover:cursor-pointer"
          onClick={() => onAnimeClick(a.media_id!)}
        >
          {a.media_title}
        </span>
        <span className="text-hint windows95-font text-xs">
          {a.progress ? `${a.progress}` : ""}
          {a.progress ? " - " : ""}
          {formatActivityTime(a.created_at, t, locale)}
        </span>
      </div>
    </div>
  );
}

function FeedTab({
  userId,
  friendIds,
  lists,
  onAnimeClick,
}: {
  userId: number;
  friendIds: number[];
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const [statusFilter, setStatusFilter] = useState("");
  const [includeFriends, setIncludeFriends] = useState(false);
  const activityUserIds = useMemo(() => {
    const ids = includeFriends ? [userId, ...friendIds] : [userId];
    return [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ].sort((a, b) => a - b);
  }, [friendIds, includeFriends, userId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["anilist_activity", activityUserIds],
    queryFn: () =>
      invoke<AniActivity[]>("get_anilist_activity", {
        userIds: activityUserIds,
      }),
    enabled: userId > 0,
    staleTime: 60_000,
  });

  const listItems = useMemo(() => {
    const activities = (data ?? []).filter(
      (activity) =>
        activity.activity_type === "list" &&
        activity.media_id != null &&
        (statusFilter === "" || activity.status === statusFilter)
    );

    // AniList activity is the authoritative history. The list fallback keeps
    // the view useful when AniList returns no list activities for an account.
    const filtered =
      activities.length > 0 || includeFriends
        ? activities
        : lists.flatMap((list) =>
            list.entries
              .filter(
                (entry) =>
                  statusFilter === "" || entry.list_status === statusFilter
              )
              .map<AniActivity>((entry) => ({
                id: entry.media.id,
                created_at: entry.created_at ?? 0,
                activity_type: "list",
                status: entry.list_status,
                progress:
                  entry.progress == null ? null : String(entry.progress),
                text: null,
                media_id: entry.media.id,
                media_title: entry.media.title,
                media_cover: entry.media.cover_url,
                user_id: userId,
                user_name: "",
                user_avatar: null,
              }))
          );

    const groups = new Map<string, AniActivity[]>();
    for (const activity of filtered) {
      if (activity.created_at <= 0) continue;
      const label = groupLabel(activity.created_at, t, locale);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(activity);
    }
    return groups;
  }, [data, includeFriends, lists, locale, statusFilter, userId, t]);

  const textItems = useMemo(
    () => (data ?? []).filter((a) => a.activity_type !== "list"),
    [data]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <SmallLoader size={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center">
          {t("anilist.activity.loadError", {
            error: String(error ?? t("anilist.activity.unknownError")),
          })}
        </span>
        <Button onClick={() => refetch()} className="text-xs">
          {t("anilist.activity.retry")}
        </Button>
      </div>
    );
  }

  if (!data?.length && lists.every((l) => l.entries.length === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <span className="windows95-text">{t("anilist.activity.empty")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            className={`windows95-text px-1.5 py-0.5 text-xs ${statusFilter === f.value ? "windows95-active-border bg-secondary text-white" : "windows95-border bg-white"}`}
            variant="ghost"
            onClick={() => setStatusFilter(f.value)}
          >
            {t(f.key)}
          </Button>
        ))}
        {friendIds.length > 0 && (
          <label
            className="windows95-text ml-auto flex items-center gap-1 text-xs"
            title={t("anilist.activity.friendsHint")}
          >
            <Checkbox checked={includeFriends} onChange={setIncludeFriends} />
            {t("anilist.activity.includeFriends")}
          </label>
        )}
      </div>

      {textItems.length > 0 && (
        <section className="mt-1 flex flex-col gap-0.5">
          <span className="windows95-text text-hint flex items-center gap-1 text-xs font-bold">
            <List className="size-3" /> {t("anilist.activity.notes")}
          </span>
          <div className="flex flex-col gap-0.5">
            {textItems.map((a) => (
              <FeedItem key={a.id} a={a} onAnimeClick={onAnimeClick} />
            ))}
          </div>
        </section>
      )}

      {listItems.size === 0 ? (
        <div className="flex items-center justify-center p-4">
          <span className="windows95-text text-hint text-xs">
            {t("anilist.activity.emptyStatus")}
          </span>
        </div>
      ) : (
        [...listItems.entries()].map(([label, items]) => (
          <section key={label} className="mt-1 flex flex-col gap-0.5">
            <span className="windows95-text text-hint flex items-center gap-1 text-xs font-bold">
              <CalendarDays className="size-3" /> {label}
            </span>
            <div className="flex flex-col gap-0.5">
              {items.map((a) => (
                <FeedItem key={a.id} a={a} onAnimeClick={onAnimeClick} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function CalendarTab({
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
    <main className="flex w-full flex-col gap-2">
      <section className="flex items-center justify-between px-1">
        <Button
          onClick={goPrevYear}
          size="icon"
          className="size-6"
          aria-label={t("anilist.activity.prevYear")}
        >
          <ChevronLeft className="size-3" />
        </Button>
        <span className="windows95-text text-xs font-bold">
          {year} -{" "}
          {t("anilist.activity.eventsCount", { count: grid.totalCount })}
        </span>
        <Button
          onClick={goNextYear}
          size="icon"
          className="size-6"
          disabled={year >= now.getFullYear()}
          aria-label={t("anilist.activity.nextYear")}
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
                      year === now.getFullYear() &&
                      cell.date.toDateString() === now.toDateString();
                    const key = dayKey(cell.date);
                    const isActive = key === activeKey;
                    return (
                      <button
                        type="button"
                        key={r}
                        aria-label={t("anilist.activity.daySummary", {
                          date: cell.date.toLocaleDateString(locale),
                          count: cell.count,
                        })}
                        className="shrink-0 cursor-pointer border border-black/20"
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          backgroundColor: CELL_LEVELS[cell.level] || undefined,
                          outline: isActive
                            ? "1px solid var(--color-highlight)"
                            : undefined,
                          outlineOffset: 1,
                          boxShadow: isToday
                            ? "0 0 0 1px var(--color-secondary) inset"
                            : undefined,
                        }}
                        onMouseEnter={() =>
                          cell.count > 0 && setHoverKey(dayKey(cell.date))
                        }
                        onMouseLeave={() => setHoverKey(null)}
                        onClick={() => {
                          if (cell.count === 0) return;
                          setSelectedKey((prev) =>
                            prev === dayKey(cell.date)
                              ? null
                              : dayKey(cell.date)
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
                  {t("anilist.activity.eventAdded")}: {activeActivity.added}
                </span>
                <span>
                  {t("anilist.activity.eventProgress")}:{" "}
                  {activeActivity.progress}
                </span>
                <span>
                  {t("anilist.activity.eventCompleted")}:{" "}
                  {activeActivity.completed}
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
                      <span className="windows95-font truncate text-xs">
                        {item.title}
                      </span>
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
                {t("anilist.activity.dayHint")}
              </span>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ActivityHistoryModal({
  userId,
  friendIds,
  lists,
  initialTab,
  onClose,
  onAnimeClick,
}: {
  userId: number;
  friendIds: number[];
  lists: AniListCollection[];
  initialTab: "feed" | "calendar";
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}) {
  const [tab, setTab] = useState<"feed" | "calendar">(initialTab);
  const { t } = useI18n();

  return (
    <Modal
      header={t("anilist.activity.title")}
      onClose={onClose}
      className="w-5xl"
    >
      <Tabs
        tabs={[
          { id: "feed", label: t("anilist.activity.feed") },
          { id: "calendar", label: t("anilist.activity.calendar") },
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      <div className="bg-primary min-h-0 w-full flex-1 overflow-y-auto">
        {tab === "feed" ? (
          <FeedTab
            userId={userId}
            friendIds={friendIds}
            lists={lists}
            onAnimeClick={onAnimeClick}
          />
        ) : (
          <CalendarTab lists={lists} onAnimeClick={onAnimeClick} />
        )}
      </div>
    </Modal>
  );
}

export default ActivityHistoryModal;
