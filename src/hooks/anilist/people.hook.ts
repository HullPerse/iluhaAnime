import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { tr } from "@/lib/locale/i18n.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { addNotification } from "@/store/notification.store";
import type { AnilistRouteData, FavouritePerson } from "@/types/anilist/anilist";

function replacePerson(
  people: FavouritePerson[],
  id: number,
  person: FavouritePerson | undefined
): FavouritePerson[] {
  const index = people.findIndex((item) => item.id === id);
  if (index === -1) return person ? [...people, person] : people;
  if (!person) return people.filter((item) => item.id !== id);
  return people.map((item) => (item.id === id ? person : item));
}

export function useFavouritePeopleToggles() {
  const queryClient = useQueryClient();
  const staffPendingRef = useRef<Set<number>>(new Set());
  const toggleStaff = async (staffId: number) => {
    if (staffPendingRef.current.has(staffId)) return;
    staffPendingRef.current.add(staffId);
    const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
    const person = previous?.people.staff.find((p) => p.id === staffId);
    const wasFavourite = person !== undefined;
    if (wasFavourite) {
      queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
        old
          ? {
              ...old,
              people: {
                ...old.people,
                staff: old.people.staff.filter((p) => p.id !== staffId),
              },
            }
          : old
      );
    }
    const [updated, error] = await attempt(anilistApi.toggleFavouriteStaff(staffId));
    staffPendingRef.current.delete(staffId);
    if (error) {
      if (person)
        queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
          old
            ? {
                ...old,
                people: { ...old.people, staff: replacePerson(old.people.staff, staffId, person) },
              }
            : old
        );
      addNotification(tr("anilist.fav.toggle.failed"), "error", error.message);
    } else {
      queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
        old
          ? {
              ...old,
              people: {
                ...old.people,
                staff: replacePerson(
                  old.people.staff,
                  staffId,
                  updated.find((p) => p.id === staffId)
                ),
              },
            }
          : old
      );
    }
  };
  const characterPendingRef = useRef<Set<number>>(new Set());
  const toggleCharacter = async (characterId: number) => {
    if (characterPendingRef.current.has(characterId)) return;
    characterPendingRef.current.add(characterId);
    const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
    const person = previous?.people.characters.find((p) => p.id === characterId);
    const wasFavourite = person !== undefined;
    if (wasFavourite) {
      queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
        old
          ? {
              ...old,
              people: {
                ...old.people,
                characters: old.people.characters.filter((p) => p.id !== characterId),
              },
            }
          : old
      );
    }
    const [updated, error] = await attempt(anilistApi.toggleFavouriteCharacter(characterId));
    characterPendingRef.current.delete(characterId);
    if (error) {
      if (person)
        queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
          old
            ? {
                ...old,
                people: {
                  ...old.people,
                  characters: replacePerson(old.people.characters, characterId, person),
                },
              }
            : old
        );
      addNotification(tr("anilist.fav.toggle.failed"), "error", error.message);
    } else {
      queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
        old
          ? {
              ...old,
              people: {
                ...old.people,
                characters: replacePerson(
                  old.people.characters,
                  characterId,
                  updated.find((p) => p.id === characterId)
                ),
              },
            }
          : old
      );
    }
  };
  return { toggleStaff, toggleCharacter };
}

export function useFavPeopleCharacterSet(): Set<number> {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
  const ids = useMemo(() => new Set((data?.people.characters ?? []).map((p) => p.id)), [data]);
  return ids;
}
