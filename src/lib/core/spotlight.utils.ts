import { anilistApi } from "@/api/anilist.api";
import { readAppCache } from "@/lib/core/cache.utils";
import { hashStringToUint32, mulberry32 } from "@/lib/core/random.utils";
import type { AniMedia, SpotlightKind } from "@/types/anilist/anilist";
import type { SpotlightPage } from "@/types/core/ipc";

const SPOTLIGHT_SCORE_FLOOR = 65;

const SPOTLIGHT_PER_PAGE = 50;

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

const PERIOD_KEYS: Record<SpotlightKind, (now: Date) => string> = {
  day: (now) => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
  week: (now) => isoWeekKey(now),
  month: (now) => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
};

const PERIOD_BOUNDARIES: Record<SpotlightKind, (now: Date) => number> = {
  day: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
  week: (now) => {
    const day = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day)).getTime();
  },
  month: (now) => new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
};

export function spotlightPeriodKey(kind: SpotlightKind, now: Date): string {
  return PERIOD_KEYS[kind](now);
}

export function spotlightBoundaryMs(kind: SpotlightKind, nowMs: number): number {
  return PERIOD_BOUNDARIES[kind](new Date(nowMs));
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

async function fetchSpotlightPage(page: number): Promise<SpotlightPage> {
  return anilistApi.getSpotlightPage(page, SPOTLIGHT_PER_PAGE, SPOTLIGHT_SCORE_FLOOR);
}

export async function resolveSpotlightPick(
  kind: SpotlightKind,
  periodKey: string
): Promise<AniMedia> {
  const totalRecord = await readAppCache<number>("spotlight", `total:${periodKey}`);
  const first = totalRecord ? null : await fetchSpotlightPage(1);
  const total = totalRecord?.payload ?? first?.total ?? 0;
  const { page, index } = spotlightPageIndex(kind, periodKey, total, SPOTLIGHT_PER_PAGE);
  const pageData = first && page === 1 ? first : await fetchSpotlightPage(page);
  const pick = pageData.media[index % Math.max(1, pageData.media.length)];
  if (!pick) throw new Error("empty spotlight pool");
  return pick;
}
