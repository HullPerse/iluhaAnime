import type { AniListCollection } from "@/types/anilist/anilist";
import type { AiringEntry, CalendarCell } from "@/types/anilist/stats.anilist";

const SECONDS_PER_DAY = 86_400;

export function buildAiringEntries(lists: AniListCollection[]): AiringEntry[] {
  const result: AiringEntry[] = [];
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

export function calendarCellTone(isToday: boolean, isWeekend: boolean) {
  if (isToday) return "bg-secondary/10";
  if (isWeekend) return "bg-surface/20";
  return "bg-field";
}

export function calendarDayNumberTone(isToday: boolean, isWeekend: boolean) {
  if (isToday) return "bg-secondary text-title-text font-bold";
  if (isWeekend) return "text-destructive font-bold";
  return "text-text font-bold";
}
