import { useEffect, useRef } from "react";

import { showInfo } from "@/lib/core/ui/notification.utils";
import type { DailyResultView } from "@/types/api/daily";
import type { TranslationKey, TranslationVariables } from "@/types/core/i18n";

type DailyTranslate = (key: TranslationKey, variables?: TranslationVariables) => string;

/**
 * Shows the pack toast once when a fresh win appears. A result that was
 * already on screen at mount stays silent, so reopening the game does not
 * repeat the reward notification.
 */
export function useDailyRewardNotice(result: DailyResultView | null, t: DailyTranslate): void {
  const notified = useRef(result !== null);

  useEffect(() => {
    if (result === null || result.rewardPackId === null || notified.current) return;
    notified.current = true;
    showInfo(t("collection.game.rewardNotice.title"), t("collection.game.reward"));
  }, [result, t]);
}
