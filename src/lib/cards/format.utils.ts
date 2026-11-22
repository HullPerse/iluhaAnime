import { formatDistanceToNowOwn } from "@/lib/core/search/distance.utils";
import type { Locale } from "@/types/core/i18n";

export function formatCardDate(timestamp: number, locale: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function formatCardRelativeDate(
  timestamp: number,
  locale: Locale,
  nowMs = Date.now()
): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";

  return formatDistanceToNowOwn(timestamp * 1000, locale, nowMs);
}
