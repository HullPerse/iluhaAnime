import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { anilistApi } from "@/api/anilist.api";
import { attempt } from "@hullperse/hp_utils/attempt";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { tr } from "@/lib/locale/i18n.utils";
import { consumeAuthDeepLink, deeplinkAtoms } from "@/store/deeplink.store";
import { addNotification } from "@/store/notification.store";
import { syncCoverModeWithAnilistAuth } from "@/store/settings.store";
import type { AniUser } from "@/types/anilist/anilist";

export function useAnilistAuth(closeAuth: () => void): (authUser: AniUser) => void {
  const queryClient = useQueryClient();

  const handleAuthSuccess = useCallback(
    (authUser: AniUser) => {
      closeAuth();
      syncCoverModeWithAnilistAuth(true);
      queryClient.setQueryData(queryKeys.anilistData(), {
        user: authUser,
        lists: [],
        favourites: [],
        people: { staff: [], characters: [] },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.anilistData() });
    },
    [closeAuth, queryClient]
  );

  const authTarget = useCell(deeplinkAtoms.authTarget);
  useEffect(() => {
    if (!authTarget) return;
    consumeAuthDeepLink();
    (async () => {
      const [authUser, error] = await attempt(anilistApi.login(authTarget.accessToken));
      if (error) {
        addNotification(tr("anilist.auth.failed"), "error", error.message);
        return;
      }
      handleAuthSuccess(authUser);
    })();
  }, [authTarget, handleAuthSuccess]);

  return handleAuthSuccess;
}
