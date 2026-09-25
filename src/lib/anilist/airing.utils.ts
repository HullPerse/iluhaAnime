import { formatETA } from "@/lib/utils/time.utils";
import type { TFunc } from "@/types/i18n";

export const AIRING_TICK_MS = 30_000;

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
