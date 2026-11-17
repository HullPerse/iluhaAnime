import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { cardsApi } from "@/api/cards.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { scheduleTask } from "@hullperse/hp_utils/shared";

/**
 * One background preparation pass per app session. The backend keeps the
 * pending/ready/failed state, so a crash only means the next launch retries.
 */
export function usePrepareCardsPacks(enabled: boolean) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || !online || started.current) return;
    started.current = true;
    let cancelled = false;
    let completed = false;
    let retry: ReturnType<typeof scheduleTask> | undefined;
    const prepare = () => {
      const proxy = settingsAtoms.anilistProxyUrl.get() ?? null;
      cardsApi
        .preparePacks(proxy)
        .then(async (result) => {
          if (cancelled) return null;
          if (result.repaired > 0) {
            Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.cardsCollectionScope() }),
              queryClient.invalidateQueries({ queryKey: queryKeys.cardsCollectionsScope() }),
            ]).catch((error: unknown) => {
              reportBackgroundError("cards.prepare-packs.invalidate", error);
            });
          }
          if (result.unnotified > 0) {
            addNotification(
              t("collection.packs.ready.title"),
              "success",
              t("collection.packs.ready.body", { count: result.unnotified }),
              "cards-packs-ready"
            );
            await cardsApi.acknowledgePreparedPacks();
          }
          completed = true;
          return null;
        })
        .catch((error: unknown) => {
          reportBackgroundError("cards.prepare-packs", error);
          if (!cancelled) retry = scheduleTask("timeout", 30_000, prepare);
        });
    };
    prepare();
    return () => {
      cancelled = true;
      retry?.cancel();
      if (!completed) started.current = false;
    };
  }, [enabled, online, queryClient, t]);
}
