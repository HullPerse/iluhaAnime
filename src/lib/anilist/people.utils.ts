import type { CachedFavPerson, FavPersonKind, FavPersonRef, FavouritePerson } from "@/types/anilist";

const FAV_PEOPLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAV_PEOPLE_PAGE_SIZE = 50;
export const FAV_PEOPLE_MAX_PAGES = 20;
export function favPersonKey(kind: FavPersonKind, id: number): string {
  return `${kind}:${id}`;
}

export function unionFavAnimeIds(people: Record<string, CachedFavPerson>): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of Object.values(people)) {
    for (const id of entry.animeIds) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function isLastFavPage(count: number): boolean {
  return count < FAV_PEOPLE_PAGE_SIZE;
}

export interface FavPeopleDiff {
  fetch: FavPersonRef[];
  drop: string[];
}

export function diffFavPeople(
  cached: Record<string, CachedFavPerson>,
  staff: FavouritePerson[],
  characters: FavouritePerson[],
  now: number,
  ttlMs: number = FAV_PEOPLE_CACHE_TTL_MS
): FavPeopleDiff {
  const wanted = new Map<string, FavPersonRef>();
  for (const person of staff) {
    wanted.set(favPersonKey("staff", person.id), { id: person.id, kind: "staff" });
  }
  for (const person of characters) {
    wanted.set(favPersonKey("character", person.id), { id: person.id, kind: "character" });
  }
  const fetch: FavPersonRef[] = [];
  for (const [key, ref] of wanted) {
    const hit = cached[key];
    if (!hit || hit.updatedAt + ttlMs <= now) fetch.push(ref);
  }
  const drop = Object.keys(cached).filter((key) => !wanted.has(key));
  return { drop, fetch };
}

export function favPersonRefFromKey(key: string): FavPersonRef | null {
  const separator = key.indexOf(":");
  if (separator === -1) return null;
  const kind = key.slice(0, separator);
  const id = Number(key.slice(separator + 1));
  if ((kind !== "staff" && kind !== "character") || !Number.isInteger(id) || id <= 0) return null;
  return { id, kind };
}
