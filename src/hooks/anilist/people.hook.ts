import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { tr } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { addNotification } from "@/store/notification.store";
import type { AnilistRouteData } from "@/types/anilist";

export function useFavouritePeopleToggles() {
  const queryClient = useQueryClient();
  const staffPendingRef = useRef<Set<number>>(new Set());
  const toggleStaff = async (staffId: number) => {
    if (staffPendingRef.current.has(staffId)) return;
    staffPendingRef.current.add(staffId);
    const previous = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
    const wasFavourite = previous?.people.staff.some((p) => p.id === staffId) ?? false;
    if (wasFavourite) {
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? {
              ...(old as AnilistRouteData),
              people: {
                ...(old as AnilistRouteData).people,
                staff: (old as AnilistRouteData).people.staff.filter((p) => p.id !== staffId),
              },
            }
          : old
      );
    }
    const [updated, error] = await attempt(anilistApi.toggleFavouriteStaff(staffId));
    staffPendingRef.current.delete(staffId);
    if (error) {
      if (wasFavourite) queryClient.setQueryData(["anilist_data"], previous);
      addNotification(tr("anilist.fav.toggle.failed"), "error", error.message);
    } else {
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? {
              ...(old as AnilistRouteData),
              people: { ...(old as AnilistRouteData).people, staff: updated },
            }
          : old
      );
    }
  };
  const characterPendingRef = useRef<Set<number>>(new Set());
  const toggleCharacter = async (characterId: number) => {
    if (characterPendingRef.current.has(characterId)) return;
    characterPendingRef.current.add(characterId);
    const previous = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
    const wasFavourite = previous?.people.characters.some((p) => p.id === characterId) ?? false;
    if (wasFavourite) {
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? {
              ...(old as AnilistRouteData),
              people: {
                ...(old as AnilistRouteData).people,
                characters: (old as AnilistRouteData).people.characters.filter(
                  (p) => p.id !== characterId
                ),
              },
            }
          : old
      );
    }
    const [updated, error] = await attempt(anilistApi.toggleFavouriteCharacter(characterId));
    characterPendingRef.current.delete(characterId);
    if (error) {
      if (wasFavourite) queryClient.setQueryData(["anilist_data"], previous);
      addNotification(tr("anilist.fav.toggle.failed"), "error", error.message);
    } else {
      queryClient.setQueryData(["anilist_data"], (old: unknown) =>
        old
          ? {
              ...(old as AnilistRouteData),
              people: { ...(old as AnilistRouteData).people, characters: updated },
            }
          : old
      );
    }
  };
  return { toggleStaff, toggleCharacter };
}

export function useFavPeopleCharacterSet(): Set<number> {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
  const ids = useMemo(() => new Set((data?.people.characters ?? []).map((p) => p.id)), [data]);
  return ids;
}
