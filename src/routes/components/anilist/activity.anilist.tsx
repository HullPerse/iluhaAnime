import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader,
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
import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import type { AniActivity, AniListCollection } from "@/types/anilist";

const MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Де",
];
const CELL_LEVELS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
const CELL_SIZE = 16;
const CELL_GAP = 4;

const STATUS_ICONS: Record<string, typeof Play> = {
  CURRENT: Play,
  COMPLETED: Check,
  DROPPED: X,
  PLANNING: Bookmark,
  PAUSED: Pause,
  REPEATING: RotateCcw,
};

const STATUS_LABELS: Record<string, string> = {
  CURRENT: "начал(а) смотреть",
  COMPLETED: "посмотрел(а)",
  DROPPED: "бросил(а)",
  PLANNING: "запланировал(а)",
  PAUSED: "поставил(а) на паузу",
  REPEATING: "пересматривает",
};

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "CURRENT", label: "Начал" },
  { value: "COMPLETED", label: "Завершил" },
  { value: "DROPPED", label: "Бросил" },
  { value: "PAUSED", label: "Пауза" },
  { value: "PLANNING", label: "План" },
  { value: "REPEATING", label: "Повтор" },
];

function formatTime(unix: number): string {
  const now = Date.now() / 1000;
  const diff = now - unix;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
  return new Date(unix * 1000).toLocaleDateString("ru-RU");
}

function groupLabel(unix: number): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const startToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startToday.getTime() - startDay.getTime()) / 86400000,
  );
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU");
}

function FeedItem({
  a,
  onAnimeClick,
}: {
  a: AniActivity;
  onAnimeClick: (id: number) => void;
}) {
  const Icon = STATUS_ICONS[a.status ?? ""];

  if (a.activity_type !== "list" || !a.media_id) {
    return (
      <div className="flex flex-row items-start gap-2 px-1 py-1 windows95-active-border bg-primary">
        {a.user_avatar ? (
          <ImageComponent
            src={a.user_avatar}
            alt="user_avatar"
            className="w-7 h-7 shrink-0 windows95-active-border"
          />
        ) : (
          <div className="w-7 h-7 shrink-0 windows95-active-border bg-white flex items-center justify-center text-[9px] font-bold">
            {a.user_name[0]}
          </div>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] windows95-text">
            <span className="font-bold">{a.user_name}</span>{" "}
            <span className="text-muted">[заметка]</span> {a.text}
          </span>
          <span className="text-[9px] text-muted">
            {formatTime(a.created_at)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-2 px-1 py-1 windows95-active-border bg-primary">
      {a.media_cover && (
        <ImageComponent
          src={a.media_cover}
          alt="media_cover"
          className="h-16 w-11 object-cover shrink-0 windows95-active-border hover:cursor-pointer"
          onClick={() => onAnimeClick(a.media_id!)}
        />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] windows95-text">
          {a.user_name && (
            <>
              <span className="font-bold">{a.user_name}</span>{" "}
            </>
          )}
          {Icon && <Icon className="size-2.5 inline" />}{" "}
          {STATUS_LABELS[a.status ?? ""] ?? a.status}{" "}
        </span>
        <span
          className="text-[11px] windows95-text font-bold underline decoration-dotted hover:cursor-pointer line-clamp-2"
          onClick={() => onAnimeClick(a.media_id!)}
        >
          {a.media_title}
        </span>
        <span className="text-[9px] text-muted windows95-font">
          {a.progress ? `${a.progress}` : ""}
          {a.progress ? " · " : ""}
          {formatTime(a.created_at)}
        </span>
      </div>
    </div>
  );
}

function FeedTab({
  userId,
  lists,
  onAnimeClick,
}: {
  userId: number;
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["anilist_activity", userId],
    queryFn: () =>
      invoke<AniActivity[]>("get_anilist_activity", { userIds: [userId] }),
    enabled: userId > 0,
  });

  const listItems = useMemo(() => {
    const filtered: AniActivity[] = [];
    for (const list of lists) {
      for (const entry of list.entries) {
        if (statusFilter !== "" && entry.list_status !== statusFilter) continue;
        const item: AniActivity = {
          id: entry.media.id,
          created_at: entry.created_at ?? 0,
          activity_type: "list",
          status: entry.list_status,
          progress: entry.progress != null ? String(entry.progress) : null,
          text: null,
          media_id: entry.media.id,
          media_title: entry.media.title,
          media_cover: entry.media.cover_url,
          user_id: userId,
          user_name: "",
          user_avatar: null,
        };
        filtered.push(item);
      }
    }
    const groups = new Map<string, AniActivity[]>();
    for (const a of filtered) {
      if (a.created_at <= 0) continue;
      const label = groupLabel(a.created_at);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(a);
    }
    return groups;
  }, [lists, statusFilter, userId]);

  const textItems = useMemo(
    () => (data ?? []).filter((a) => a.activity_type !== "list"),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 p-6">
        <Loader className="size-6 animate-spin windows95-text" />
      </div>
    );
  }

  if (!data?.length && lists.every((l) => l.entries.length === 0)) {
    return (
      <div className="flex items-center justify-center flex-1 p-6">
        <span className="windows95-text">Нет активности</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1 shrink-0">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            className={`px-1.5 py-0.5 text-[10px] windows95-text ${statusFilter === f.value ? "windows95-active-border text-white bg-secondary" : "windows95-border bg-white"}`}
            variant="ghost"
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {textItems.length > 0 && (
        <section className="flex flex-col gap-0.5 mt-1">
          <span className="text-[10px] windows95-text font-bold text-muted flex items-center gap-1">
            <List className="size-3" /> Заметки
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
          <span className="windows95-text text-muted text-[10px]">
            Нет записей с таким статусом
          </span>
        </div>
      ) : (
        [...listItems.entries()].map(([label, items]) => (
          <section key={label} className="flex flex-col gap-0.5 mt-1">
            <span className="text-[10px] windows95-text font-bold text-muted flex items-center gap-1">
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

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DayActivityItem {
  id: number;
  title: string;
  cover: string | null;
  progress: number | null;
  events: string;
}

interface DayActivity {
  added: number;
  progress: number;
  completed: number;
  count: number;
  items: DayActivityItem[];
}

interface YearGridCell {
  date: Date;
  level: number;
  count: number;
}

function buildActivityMap(
  lists: AniListCollection[],
): Map<string, DayActivity> {
  const map = new Map<string, DayActivity>();

  const addEvent = (key: string, kind: string, item: DayActivityItem) => {
    let day = map.get(key);
    if (!day) {
      day = { added: 0, progress: 0, completed: 0, count: 0, items: [] };
      map.set(key, day);
    }
    if (kind === "added") day.added++;
    else if (kind === "progress") day.progress++;
    else day.completed++;
    day.count++;

    const existing = day.items.find((it) => it.id === item.id);
    if (existing) {
      if (!existing.events.includes(kind)) {
        existing.events = `${existing.events}, ${kind}`;
      }
    } else {
      day.items.push({ ...item, events: kind });
    }
  };

  const kindLabel: Record<string, string> = {
    added: "добавлено",
    progress: "обновлено",
    completed: "завершено",
  };

  for (const list of lists) {
    for (const entry of list.entries) {
      const item: DayActivityItem = {
        id: entry.media.id,
        title: entry.media.title,
        cover: entry.media.cover_url,
        progress: entry.progress,
        events: "",
      };
      if (entry.created_at) {
        addEvent(dayKey(new Date(entry.created_at * 1000)), "added", item);
      }
      if (entry.completed_at) {
        const [y, m, d] = entry.completed_at.split("-").map(Number);
        if (y && m && d) {
          addEvent(dayKey(new Date(y, m - 1, d)), "completed", item);
        }
      }
      if (entry.updated_at) {
        addEvent(dayKey(new Date(entry.updated_at * 1000)), "progress", item);
      }
    }
  }

  for (const day of map.values()) {
    for (const it of day.items) {
      it.events = it.events
        .split(", ")
        .map((k) => kindLabel[k] ?? k)
        .join(" · ");
    }
  }
  return map;
}

function buildYearGrid(
  year: number,
  activity: Map<string, DayActivity>,
): {
  columns: { month: number; cells: YearGridCell[] }[];
  totalCount: number;
} {
  const firstDay = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  let totalCount = 0;
  let maxCount = 0;
  for (const act of activity.values()) {
    if (act.count > maxCount) maxCount = act.count;
    totalCount += act.count;
  }

  const buckets = maxCount > 0 ? (maxCount - 1) / 3 : 1;
  const columns: { month: number; cells: YearGridCell[] }[] = [];
  const cursor = new Date(start);
  while (cursor <= lastDay) {
    const cells: YearGridCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      const inYear = d.getFullYear() === year;
      const act = inYear ? activity.get(dayKey(d)) : undefined;
      cells.push({
        date: new Date(d),
        level:
          inYear && act && act.count > 0
            ? Math.min(4, 1 + Math.round(act.count / buckets))
            : 0,
        count: act?.count ?? 0,
      });
    }
    columns.push({ month: cursor.getMonth(), cells });
    cursor.setDate(cursor.getDate() + 7);
  }
  return { columns, totalCount };
}

function CalendarTab({
  lists,
  onAnimeClick,
}: {
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activity = useMemo(() => buildActivityMap(lists), [lists]);
  const grid = useMemo(() => buildYearGrid(year, activity), [year, activity]);

  const pitch = CELL_SIZE + CELL_GAP;

  const activeKey = selectedKey ?? hoverKey;
  const activeActivity = activeKey ? activity.get(activeKey) : undefined;

  const goPrevYear = () => setYear((y) => y - 1);
  const goNextYear = () => setYear((y) => Math.min(y + 1, now.getFullYear()));

  return (
    <main className="flex flex-col gap-2 w-full">
      <section className="flex items-center justify-between px-1">
        <Button onClick={goPrevYear} size="icon" className="size-6">
          <ChevronLeft className="size-3" />
        </Button>
        <span className="windows95-text text-xs font-bold">
          {year} · Событий: {grid.totalCount}
        </span>
        <Button
          onClick={goNextYear}
          size="icon"
          className="size-6"
          disabled={year >= now.getFullYear()}
        >
          <ChevronRight className="size-3" />
        </Button>
      </section>

      <div className="flex flex-col md:flex-row gap-2 items-stretch h-80">
        <section className="windows95-border bg-white flex-1 min-w-0 h-full flex flex-col overflow-x-auto">
          <div className="p-2 flex flex-col flex-1 min-h-0">
            <div className="h-4 relative mb-0.5">
              {grid.columns.map((col, ci) => {
                if (col.month === grid.columns[ci - 1]?.month) return null;
                return (
                  <span
                    key={`m${ci}`}
                    className="absolute top-0 text-[9px] windows95-font text-text leading-4 truncate"
                    style={{
                      left: ci * pitch,
                      maxWidth: pitch * 2,
                    }}
                  >
                    {MONTH_LABELS[col.month]}
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
                        key={r}
                        className="shrink-0 border border-black/20 cursor-pointer"
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
                          filter: cell.count > 0 ? undefined : undefined,
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
                              : dayKey(cell.date),
                          );
                        }}
                        title={
                          cell.count > 0
                            ? `${cell.date.toLocaleDateString("ru-RU")}: ${cell.count}`
                            : cell.date.toLocaleDateString("ru-RU")
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="md:w-64 shrink-0 windows95-border bg-white flex flex-col overflow-hidden h-full">
          {activeActivity ? (
            <div className="flex flex-col min-h-0">
              <div className="flex items-center justify-between px-2 py-1 border-b border-b-muted/40">
                <span className="windows95-text text-[10px] font-bold">
                  {activeKey
                    ? new Date(
                        Number(activeKey.split("-")[0]),
                        Number(activeKey.split("-")[1]) - 1,
                        Number(activeKey.split("-")[2]),
                      ).toLocaleDateString("ru-RU")
                    : ""}
                </span>
                <Button
                  onClick={() => setSelectedKey(null)}
                  className="px-1 py-0 text-[9px] windows95-text"
                  variant="ghost"
                >
                  ✕
                </Button>
              </div>
              <div className="px-2 py-0.5 text-[9px] windows95-text text-muted border-b border-b-muted/40 flex flex-col gap-0.5">
                <span>Добавлено: {activeActivity.added}</span>
                <span>Обновлено: {activeActivity.progress}</span>
                <span>Завершено: {activeActivity.completed}</span>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                {activeActivity.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-surface cursor-pointer border-b border-b-muted/40"
                    onClick={() => onAnimeClick(item.id)}
                  >
                    {item.cover && (
                      <ImageComponent
                        src={item.cover}
                        alt="cover"
                        className="w-7 h-10 shrink-0 windows95-border"
                      />
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-[10px] windows95-font">
                        {item.title}
                      </span>
                      <span className="text-muted text-[8px] windows95-font">
                        {item.events}
                        {item.progress != null && ` · Эп. ${item.progress}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 p-3">
              <span className="text-[10px] windows95-text text-muted text-center">
                Наведите курсор на день с активностью, чтобы увидеть детали
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
  lists,
  initialTab,
  onClose,
  onAnimeClick,
}: {
  userId: number;
  lists: AniListCollection[];
  initialTab: "feed" | "calendar";
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}) {
  const [tab, setTab] = useState<"feed" | "calendar">(initialTab);

  return (
    <Modal header="Активность и история" onClose={onClose} className="w-5xl">
      <Tabs
        tabs={[
          { id: "feed", label: "Лента" },
          { id: "calendar", label: "Календарь" },
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      <div className="flex-1 min-h-0 overflow-y-auto w-full bg-primary">
        {tab === "feed" ? (
          <FeedTab userId={userId} lists={lists} onAnimeClick={onAnimeClick} />
        ) : (
          <CalendarTab lists={lists} onAnimeClick={onAnimeClick} />
        )}
      </div>
    </Modal>
  );
}

export default ActivityHistoryModal;
