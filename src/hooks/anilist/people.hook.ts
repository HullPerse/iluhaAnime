import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { translate } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { AnilistRouteData } from "@/types/anilist";

export function useFavouritePeopleToggles() {
  const queryClient = useQueryClient();
  const staffPendingRef = useRef(false);
  const toggleStaff = async (staffId: number) => {
    if (staffPendingRef.current) return;
    staffPendingRef.current = true;
    const [updated, error] = await attempt(anilistApi.toggleFavouriteStaff(staffId));
    if (error) {
      useNotificationStore
        .getState()
        .add(
          translate(useSettingsStore.getState().language, "anilist.fav.toggle.failed"),
          "error",
          error.message
        );
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
    staffPendingRef.current = false;
  };
  const characterPendingRef = useRef(false);
  const toggleCharacter = async (characterId: number) => {
    if (characterPendingRef.current) return;
    characterPendingRef.current = true;
    const [updated, error] = await attempt(anilistApi.toggleFavouriteCharacter(characterId));
    if (error) {
      useNotificationStore
        .getState()
        .add(
          translate(useSettingsStore.getState().language, "anilist.fav.toggle.failed"),
          "error",
          error.message
        );
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
    characterPendingRef.current = false;
  };
  return { toggleStaff, toggleCharacter };
}

export function useFavPeopleCharacterSet(): Set<number> {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
  const ids = useMemo(() => new Set((data?.people.characters ?? []).map((p) => p.id)), [data]);
  return ids;
}
