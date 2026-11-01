import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { attempt } from "@/lib/core/attempt.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";
import type { AnilistRouteData } from "@/types/anilist/anilist";

export function useAnilistFavouriteToggle(): (animeId: number) => Promise<void> {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Set<number>>(new Set());

  return useCallback(
    async (animeId: number) => {
      if (pendingRef.current.has(animeId)) return;
      pendingRef.current.add(animeId);
      const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
      const wasFavourite = previous?.favourites.some((item) => item.id === animeId) ?? false;
      if (wasFavourite) {
        queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
          old ? { ...old, favourites: old.favourites.filter((item) => item.id !== animeId) } : old
        );
      }
      const [updated, error] = await attempt(anilistApi.toggleFavourite(animeId));
      pendingRef.current.delete(animeId);
      if (error) {
        if (wasFavourite) {
          queryClient.setQueryData(queryKeys.anilistData(), previous);
        }
        addNotification(tr("anilist.fav.toggle.failed"), "error", error.message);
        return;
      }
      queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) =>
        old ? { ...old, favourites: updated } : old
      );
    },
    [queryClient]
  );
}
