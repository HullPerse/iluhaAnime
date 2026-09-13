import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { translate } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { AnilistRouteData, FavouritePerson } from "@/types/anilist";

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

export function useFavPeopleCharacterSet(): Set<number> {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
  const ids = useMemo(() => new Set((data?.people.characters ?? []).map((p) => p.id)), [data]);
  return ids;
}
