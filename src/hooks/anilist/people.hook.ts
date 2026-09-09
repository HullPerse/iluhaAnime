import { useEffect, useMemo } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniCharacterMediaEdge,
  AniStaffDetail,
  AnilistRouteData,
  FavouritePerson,
} from "@/types/anilist";

const EMPTY_ANIME = new Set<number>();

async function fetchPersonAnime(staff: FavouritePerson[], characters: FavouritePerson[]) {
  const settled = await Promise.all(
    [
      ...staff.map((p) =>
        invokeTyped<AniStaffDetail>("get_staff_characters", {
          id: p.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        })
          .then((detail) => detail.media.map((m) => m.id))
          .catch(() => [] as number[])
      ),
      ...characters.map((p) =>
        invokeTyped<AniCharacterMediaEdge[]>("get_character_media", {
          id: p.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        })
          .then((edges) => edges.map((e) => e.id))
          .catch(() => [] as number[])
      ),
    ] as Array<Promise<number[]>>
  );
  return new Set(settled.flat());
}

export function useFavouritePeopleAnime(
  staff: FavouritePerson[],
  characters: FavouritePerson[],
  enabled: boolean
): Set<number> {
  const staffKey = staff.map((p) => p.id).join(",");
  const characterKey = characters.map((p) => p.id).join(",");
  const proxy = useSettingsStore((s) => s.anilistProxyUrl);
  const { data } = useQuery({
    queryKey: ["fav_people_anime", staffKey, characterKey, proxy ?? ""],
    queryFn: () => fetchPersonAnime(staff, characters),
    enabled: enabled && (staff.length > 0 || characters.length > 0),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return data ?? EMPTY_ANIME;
}

export function useFavPeopleAnimeSet(): Set<number> {
  const ids = useSearchStore((s) => s.favPeopleAnimeIds);
  return useMemo(() => new Set(ids), [ids]);
}

export function useFavouritePeopleToggles() {
  const queryClient = useQueryClient();
  const toggleStaff = async (staffId: number) => {
    try {
      const updated = await invokeTyped<FavouritePerson[]>("toggle_favourite_staff", {
        staffId,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      });
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? { ...(old as AnilistRouteData), people: { ...(old as AnilistRouteData).people, staff: updated } }
          : old
      );
    } catch (error) {
      console.warn("toggle_favourite_staff failed", error);
    }
  };
  const toggleCharacter = async (characterId: number) => {
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
      console.warn("toggle_favourite_character failed", error);
    }
  };
  return { toggleStaff, toggleCharacter };
}

export function useSyncFavPeopleAnimeIds(
  staff: FavouritePerson[],
  characters: FavouritePerson[],
  loggedIn: boolean
) {
  const favAnime = useFavouritePeopleAnime(staff, characters, loggedIn);
  const setFavPeopleAnimeIds = useSearchStore((s) => s.setFavPeopleAnimeIds);
  useEffect(() => {
    setFavPeopleAnimeIds(loggedIn ? [...favAnime] : []);
  }, [favAnime, loggedIn, setFavPeopleAnimeIds]);
}

/** Ids of the user's favourite characters, for gold borders on character cards. */
export function useFavPeopleCharacterSet(): Set<number> {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
  const ids = useMemo(() => new Set((data?.people.characters ?? []).map((p) => p.id)), [data]);
  return ids;
}
