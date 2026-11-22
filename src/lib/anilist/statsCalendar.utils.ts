import { seasonAiringRows } from "@/lib/core/anilist/airing.utils";
import type { AniListCollection, AniMedia } from "@/types/anilist/anilist";
import type { AiringEntry, CalendarCell, CalendarWeekDay } from "@/types/anilist/stats.anilist";

const SECONDS_PER_DAY = 86_400;
const WEEK_DAYS = 7;

export function buildAiringEntries(lists: AniListCollection[]): AiringEntry[] {
  const result: AiringEntry[] = [];
  const seen = new Set<number>();

  for (const list of lists) {
    for (const entry of list.entries) {
      const at = entry.media.next_airing_at;
      const id = entry.media.id;

      if (!at || seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        title: entry.media.title,
        airingAt: at,
        episode: entry.media.next_episode,
        coverUrl: entry.media.cover_url,
      });
    }
  }

  result.sort((a, b) => a.airingAt - b.airingAt);

  return result;
}

export function buildWeekDays(
  allEntries: AiringEntry[],
  from: Date = new Date()
): CalendarWeekDay[] {
  const days: CalendarWeekDay[] = [];

  for (let offset = 0; offset < WEEK_DAYS; offset++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    days.push({ dayStartMs: date.getTime(), entries: [] });
  }

  const byDay = new Map(days.map((day) => [day.dayStartMs, day]));
  const seen = new Set<number>();

  for (const entry of allEntries) {
    if (!Number.isFinite(entry.airingAt) || entry.airingAt <= 0) continue;
    const date = new Date(entry.airingAt * 1000);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = byDay.get(dayStart.getTime());

    if (day == null || seen.has(entry.id)) continue;
    seen.add(entry.id);
    day.entries.push(entry);
  }

  for (const day of days) {
    day.entries.sort((a, b) => a.airingAt - b.airingAt);
  }

  return days;
}

export function buildSeasonAiringEntries(media: AniMedia[]): AiringEntry[] {
  return seasonAiringRows(media).map((row) => ({
    id: row.id,
    title: row.title,
    airingAt: row.airingAt,
    episode: row.episode,
    coverUrl: row.cover,
  }));
}

export function buildCalendarCells(
  allEntries: AiringEntry[],
  year: number,
  month: number
): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStart = Math.floor(new Date(year, month, day).getTime() / 1000);
    const dateEnd = dateStart + SECONDS_PER_DAY;
    const entries = allEntries.filter((e) => e.airingAt >= dateStart && e.airingAt < dateEnd);
    cells.push({ date: day, entries });
  }

  return cells;
}

type CalendarDayFlags = { isToday: boolean; isWeekend: boolean };

type CalendarTone = { cell: string; dayNumber: string };

export function calendarTone({ isToday, isWeekend }: CalendarDayFlags): CalendarTone {
  if (isToday) {
    return {
      cell: "bg-secondary/10",
      dayNumber: "bg-secondary text-title-text font-bold",
    };
  }

  if (isWeekend) {
    return {
      cell: "bg-surface/40",
      dayNumber: "text-destructive font-bold",
    };
  }

  return {
    cell: "bg-field",
    dayNumber: "text-text font-bold",
  };
}
