import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { cardsApi } from "@/api/cards.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { scheduleTask } from "@hullperse/hp_utils/shared";

const AUTO_PREPARE_LIMIT = 10;

/**
 * One automatic preparation run per app session, and only for a small backlog;
 * larger queues wait for the explicit button. The backend drains the queue in
 * bounded passes and keeps the pending/ready/failed state, so a crash only means
 * the next launch retries.
 */
export function usePrepareCardsPacks(enabled: boolean) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const started = useRef<boolean>(false);
  useTauriEvent(
    "cards-album-metadata-updated",
    () => {
      for (const queryKey of [
        queryKeys.cardsCollectionScope(),
        queryKeys.cardsCollectionsScope(),
        queryKeys.cardsAnimeCollectionScope(),
        queryKeys.cardsCollectionRosterScope(),
        queryKeys.cardsCardVariantsScope(),
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    { enabled }
  );
  useTauriEvent(
    "cards-packs-progress",
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cardsPacksScope() });

      for (const queryKey of [
        queryKeys.cardsCollectionScope(),
        queryKeys.cardsCollectionsScope(),
        queryKeys.cardsAnimeCollectionScope(),
        queryKeys.cardsCollectionRosterScope(),
        queryKeys.cardsCardVariantsScope(),
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    { enabled }
  );

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

    const prepareSmallQueue = async () => {
      try {
        const packs = await cardsApi.packs();

        if (cancelled) return;

        const queued = packs.filter(
          (pack) => pack.openedAt === null && pack.contentsState === "pending"
        );

        if (queued.length === 0 || queued.length > AUTO_PREPARE_LIMIT) {
          completed = true;

          return;
        }

        prepare();
      } catch (error) {
        reportBackgroundError("cards.prepare-packs.queue", error);
        completed = true;
      }
    };

    prepareSmallQueue();

    return () => {
      cancelled = true;
      retry?.cancel();

      if (!completed) started.current = false;
    };
  }, [enabled, online, queryClient, t]);
}
