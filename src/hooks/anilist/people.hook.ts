import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import {
  FAV_PEOPLE_MAX_PAGES,
  diffFavPeople,
  favPersonKey,
  favPersonRefFromKey,
  isLastFavPage,
  unionFavAnimeIds,
} from "@/lib/anilist/people.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { translate } from "@/lib/locale/i18n.utils";
import { readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useNotificationStore } from "@/store/notification.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AnilistRouteData,
  AniUser,
  CachedFavPerson,
  FavPeopleIndexCache,
  FavPersonMediaPage,
  FavPersonRef,
  FavouritePerson,
} from "@/types/anilist";

async function fetchFavMediaRound(
  refs: FavPersonRef[],
  page: number,
  proxy: Record<string, string>
): Promise<FavPersonMediaPage[]> {
  return invokeTyped<FavPersonMediaPage[]>("get_fav_people_media", {
    character_ids: refs.filter((ref) => ref.kind === "character").map((ref) => ref.id),
    page,
    staff_ids: refs.filter((ref) => ref.kind === "staff").map((ref) => ref.id),
    ...proxy,
  });
}

interface FavPeopleSyncInput {
  userId: number;
  staff: FavouritePerson[];
  characters: FavouritePerson[];
  cancelled: { current: boolean };
  publish: (people: Record<string, CachedFavPerson>) => void;
}

async function syncFavPeopleIndex(input: FavPeopleSyncInput): Promise<void> {
  const proxy = anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl);
  const cacheKey = `index:${input.userId}`;
  const record = await readAppCache<FavPeopleIndexCache>("fav_people", cacheKey);
  const next: Record<string, CachedFavPerson> =
    record?.payload.version === 1 ? { ...record.payload.people } : {};
  input.publish(next);
  const plan = diffFavPeople(next, input.staff, input.characters, Date.now());
  for (const key of plan.drop) delete next[key];
  if (plan.drop.length > 0) {
    input.publish(next);
    await writeAppCache("fav_people", cacheKey, {
      people: next,
      version: 1,
    } satisfies FavPeopleIndexCache);
  }
  const snapshot = new Map<string, CachedFavPerson>();
  for (const ref of plan.fetch) {
    const key = favPersonKey(ref.kind, ref.id);
    const prev = next[key];
    if (prev) snapshot.set(key, prev);
    next[key] = { animeIds: [], kind: ref.kind, updatedAt: Date.now() };
  }
  let pending = plan.fetch;
  for (let page = 1; page <= FAV_PEOPLE_MAX_PAGES && pending.length > 0; page += 1) {
    if (input.cancelled.current) return;
    let round: FavPersonMediaPage[];
    try {
      round = await fetchFavMediaRound(pending, page, proxy);
    } catch {
      for (const ref of pending) {
        const key = favPersonKey(ref.kind, ref.id);
        const prev = snapshot.get(key);
        if (prev) next[key] = prev;
        else delete next[key];
      }
      input.publish(next);
      await writeAppCache("fav_people", cacheKey, {
        people: next,
        version: 1,
      } satisfies FavPeopleIndexCache);
      return;
    }
    const full: FavPersonRef[] = [];
    for (const entry of round) {
      const ref = favPersonRefFromKey(entry.key);
      if (!ref) continue;
      const prev = next[entry.key]?.animeIds ?? [];
      next[entry.key] = {
        animeIds: [...prev, ...entry.anime_ids],
        kind: ref.kind,
        updatedAt: Date.now(),
      };
      if (!isLastFavPage(entry.anime_ids.length)) full.push(ref);
    }
    pending = full;
    input.publish(next);
    await writeAppCache("fav_people", cacheKey, {
      people: next,
      version: 1,
    } satisfies FavPeopleIndexCache);
  }
}

export function useFavPeopleAnimeSet(): Set<number> {
  const ids = useSearchStore((s) => s.favPeopleAnimeIds);
  return useMemo(() => new Set(ids), [ids]);
}

export function useFavouritePeopleToggles() {
  const queryClient = useQueryClient();
  const staffPendingRef = useRef(false);
  const toggleStaff = async (staffId: number) => {
    if (staffPendingRef.current) return;
    staffPendingRef.current = true;
    try {
      const updated = await invokeTyped<FavouritePerson[]>("toggle_favourite_staff", {
        staffId,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      });
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? {
              ...(old as AnilistRouteData),
              people: { ...(old as AnilistRouteData).people, staff: updated },
            }
          : old
      );
    } catch (error) {
      useNotificationStore
        .getState()
        .add(
          translate(useSettingsStore.getState().language, "anilist.fav.toggle.failed"),
          "error",
          error instanceof Error ? error.message : String(error)
        );
    } finally {
      staffPendingRef.current = false;
    }
  };
  const characterPendingRef = useRef(false);
  const toggleCharacter = async (characterId: number) => {
    if (characterPendingRef.current) return;
    characterPendingRef.current = true;
    try {
      const updated = await invokeTyped<FavouritePerson[]>("toggle_favourite_character", {
        characterId,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      });
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? {
              ...(old as AnilistRouteData),
              people: { ...(old as AnilistRouteData).people, characters: updated },
            }
          : old
      );
    } catch (error) {
      useNotificationStore
        .getState()
        .add(
          translate(useSettingsStore.getState().language, "anilist.fav.toggle.failed"),
          "error",
          error instanceof Error ? error.message : String(error)
        );
    } finally {
      characterPendingRef.current = false;
    }
  };
  return { toggleStaff, toggleCharacter };
}
export function useSyncFavPeopleAnimeIds(
  user: Pick<AniUser, "id"> | null,
  staff: FavouritePerson[],
  characters: FavouritePerson[],
  loggedIn: boolean
): void {
  const setFavPeopleAnimeIds = useSearchStore((s) => s.setFavPeopleAnimeIds);
  useEffect(() => {
    const userId = user?.id ?? null;
    if (!loggedIn || userId == null) {
      if (!loggedIn) setFavPeopleAnimeIds([]);
      return;
    }
    const cancelled = { current: false };
    syncFavPeopleIndex({
      cancelled,
      characters,
      publish: (people) => {
        if (!cancelled.current) setFavPeopleAnimeIds(unionFavAnimeIds(people));
      },
      staff,
      userId,
    });
    return () => {
      cancelled.current = true;
    };
  }, [user, staff, characters, loggedIn, setFavPeopleAnimeIds]);
}

export function useFavPeopleCharacterSet(): Set<number> {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
  const ids = useMemo(() => new Set((data?.people.characters ?? []).map((p) => p.id)), [data]);
  return ids;
}
