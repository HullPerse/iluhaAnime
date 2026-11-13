import { formatETA } from "@/lib/core/text/time.utils";
import type { AniListCollection, AniMedia } from "@/types/anilist/anilist";
import type { TFunc } from "@/types/core/i18n";
import type { AiringDay, AiringRow } from "@/types/core/airing";

export const AIRING_TICK_MS = 30_000;

export type AnimeSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export function currentAnimeSeason(now = new Date()): {
  season: AnimeSeason;
  year: number;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

const AIRING_WEEK_DAYS = 7;

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

/// Rows for the current season come from a different source than the user's
/// lists, so they carry no list status and are deduplicated by media id.
export function seasonAiringRows(media: AniMedia[]): AiringRow[] {
  const rows: AiringRow[] = [];
  const seen = new Set<number>();
  for (const entry of media) {
    if (seen.has(entry.id)) continue;
    const airingAt = entry.next_airing_at;
    if (airingAt == null || !Number.isFinite(airingAt) || airingAt <= 0) continue;
    seen.add(entry.id);
    rows.push({
      id: entry.id,
      title: entry.title,
      cover: entry.cover_url,
      episode: entry.next_episode,
      airingAt,
    });
  }
  rows.sort((left, right) => left.airingAt - right.airingAt);
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
