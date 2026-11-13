import { useEffect, useRef } from "react";

import { cardsApi } from "@/api/cards.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";

/**
 * One background preparation pass per app session. The backend keeps the
 * pending/ready/failed state, so a crash only means the next launch retries.
 */
export function usePrepareCardsPacks(enabled: boolean) {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || !online || started.current) return;
    started.current = true;
    const proxy = settingsAtoms.anilistProxyUrl.get() ?? null;
    cardsApi
      .preparePacks(proxy)
      .then(async (result) => {
        if (result.unnotified > 0) {
          addNotification(
            t("collection.packs.ready.title"),
            "success",
            t("collection.packs.ready.body", { count: result.unnotified }),
            "cards-packs-ready"
          );
          await cardsApi.acknowledgePreparedPacks();
        }
        return null;
      })
      .catch((error: unknown) => {
        started.current = false;
        reportBackgroundError("cards.prepare-packs", error);
      });
  }, [enabled, online, t]);
}
