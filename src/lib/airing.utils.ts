import { formatETA } from "@/lib/time.utils";
import type { AniListCollection } from "@/types/anilist";
import type { TFunc } from "@/types/i18n";

export const AIRING_TICK_MS = 30_000;

export const AIRING_WEEK_DAYS = 7;

const SECS_PER_DAY = 86_400;

export function airingCountdownSecs(airingAt: number | null, nowMs: number): number | null {
  if (airingAt == null || !Number.isFinite(airingAt) || airingAt <= 0) return null;
  if (!Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round((airingAt * 1000 - nowMs) / 1000));
}

export function formatAiringCountdown(secs: number | null, t: TFunc): string {
  if (secs == null || !Number.isFinite(secs) || secs <= 0) return "";
  if (secs < SECS_PER_DAY) return formatETA(secs, t);
  const d = Math.floor(secs / SECS_PER_DAY);
  const h = Math.floor((secs % SECS_PER_DAY) / 3600);
  if (h === 0) return t("anilist.airing.days", { d });
  return t("anilist.airing.days.hours", { d, h });
}

export function formatAiringLocal(airingAt: number | null, locale: string): string | null {
  if (airingAt == null || !Number.isFinite(airingAt) || airingAt <= 0) return null;
  return new Date(airingAt * 1000).toLocaleString(locale, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

export function formatAiringTime(airingAt: number | null, locale: string): string | null {
  if (airingAt == null || !Number.isFinite(airingAt) || airingAt <= 0) return null;
  return new Date(airingAt * 1000).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface AiringRow {
  id: number;
  title: string;
  cover: string | null;
  episode: number | null;
  airingAt: number;
  listStatus: string;
}

export interface AiringDay {
  dayStartMs: number;
  rows: AiringRow[];
}

export function collectAiringRows(lists: AniListCollection[], statusFilter: string): AiringRow[] {
  const rows: AiringRow[] = [];
  const seen = new Set<number>();
  for (const list of lists) {
    for (const entry of list.entries) {
      if (statusFilter !== "" && entry.list_status !== statusFilter) continue;
      const id = entry.media.id;
      if (seen.has(id)) continue;
      const airingAt = entry.media.next_airing_at;
      if (airingAt == null || !Number.isFinite(airingAt) || airingAt <= 0) continue;
      seen.add(id);
      rows.push({
        id,
        title: entry.media.title,
        cover: entry.media.cover_url,
        episode: entry.media.next_episode,
        airingAt,
        listStatus: entry.list_status,
      });
    }
  }
  rows.sort((a, b) => a.airingAt - b.airingAt);
  return rows;
}

export function groupAiringByDay(rows: AiringRow[], days = AIRING_WEEK_DAYS): AiringDay[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const groups = new Map<number, AiringRow[]>();
  for (const row of rows) {
    const date = new Date(row.airingAt * 1000);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - now.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays >= days) continue;
    const key = date.getTime();
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayStartMs, dayRows]) => ({ dayStartMs, rows: dayRows }));
}
