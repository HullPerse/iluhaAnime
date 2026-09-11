import { hashStringToUint32, mulberry32 } from "@/lib/utils/random.utils";
import type { SpotlightKind } from "@/types/anilist";

export const SPOTLIGHT_SCORE_FLOOR = 65;

export const SPOTLIGHT_PER_PAGE = 50;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoWeekKey(date: Date): string {
  const anchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (anchor.getDay() + 6) % 7;
  anchor.setDate(anchor.getDate() - day + 3);
  const firstThursday = new Date(anchor.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const week = 1 + Math.round((anchor.getTime() - firstThursday.getTime()) / 604800000);
  return `${anchor.getFullYear()}-W${pad2(week)}`;
}

export function spotlightPeriodKey(kind: SpotlightKind, now: Date): string {
  if (kind === "day")
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  if (kind === "week") return isoWeekKey(now);
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function spotlightBoundaryMs(kind: SpotlightKind, nowMs: number): number {
  const now = new Date(nowMs);
  if (kind === "day") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  }
  if (kind === "week") {
    const day = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day)).getTime();
  }
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

export function spotlightPageIndex(
  kind: SpotlightKind,
  periodKey: string,
  total: number,
  perPage: number
): { page: number; index: number } {
  const rng = mulberry32(hashStringToUint32(`spotlight:${kind}:${periodKey}`));
  const lastPage = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, perPage)));
  return {
    page: 1 + Math.floor(rng() * lastPage),
    index: Math.floor(rng() * Math.max(1, perPage)),
  };
}
