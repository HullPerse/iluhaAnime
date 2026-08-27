import type { TranslationKey } from "@/lib/i18n";
import type { Locale, TranslationVariables } from "@/types";
import type { AniListCollection } from "@/types/anilist";

export type ActivityTranslate = (
  key: TranslationKey,
  variables?: TranslationVariables
) => string;

export function monthLabel(
  month: number,
  locale: Locale,
  format: "short" | "long" = "short"
): string {
  return new Date(2000, month, 1).toLocaleDateString(locale, {
    month: format,
  });
}

export function formatActivityTime(
  unix: number,
  t: ActivityTranslate,
  locale: Locale
): string {
  const now = Date.now() / 1000;
  const diff = now - unix;
  if (diff < 60) return t("anilist.activity.justNow");
  if (diff < 3600)
    return t("anilist.activity.minutesAgo", {
      count: Math.floor(diff / 60),
    });
  if (diff < 86_400)
    return t("anilist.activity.hoursAgo", {
      count: Math.floor(diff / 3600),
    });
  return new Date(unix * 1000).toLocaleDateString(locale);
}

export function groupLabel(
  unix: number,
  t: ActivityTranslate,
  locale: Locale
): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const startToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startToday.getTime() - startDay.getTime()) / 86_400_000
  );
  if (diffDays === 0) return t("anilist.activity.today");
  if (diffDays === 1) return t("anilist.activity.yesterday");
  return d.toLocaleDateString(locale);
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface DayActivityItem {
  id: number;
  title: string;
  cover: string | null;
  progress: number | null;
  events: string;
}

export interface DayActivity {
  added: number;
  progress: number;
  completed: number;
  count: number;
  items: DayActivityItem[];
}

export interface YearGridCell {
  date: Date;
  level: number;
  count: number;
}

export function buildActivityMap(
  lists: AniListCollection[],
  t: ActivityTranslate
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
    added: t("anilist.activity.eventAdded"),
    progress: t("anilist.activity.eventProgress"),
    completed: t("anilist.activity.eventCompleted"),
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
        .join(" - ");
    }
  }
  return map;
}

export function buildYearGrid(
  year: number,
  activity: Map<string, DayActivity>
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
  for (const [key, act] of activity) {
    if (!key.startsWith(`${year}-`)) continue;
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
