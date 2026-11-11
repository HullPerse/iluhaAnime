import { useEffect, useRef } from "react";

import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/shared/promise.utils";
import { prewarmPlayer, releasePlayerPrewarm } from "@/lib/player/playback.utils";
import type { TabId } from "@/types/ui/settings";

const PREWARM_TABS = new Set<TabId>(["player", "stream"]);

async function releasePrewarm(): Promise<void> {
  const [, error] = await attempt(releasePlayerPrewarm());
  if (error) reportBackgroundError("player.prewarm.release", error);
}

export function usePlayerPrewarm(activeTab: TabId, enabled: boolean): void {
  const held = useRef(false);
  const shouldHold = useRef(false);
  const hold = enabled && PREWARM_TABS.has(activeTab);

  useEffect(() => {
    shouldHold.current = hold;
    if (hold) {
      held.current = true;
      ignore(
        (async () => {
          const [, error] = await attempt(prewarmPlayer());
          if (error) {
            reportBackgroundError("player.prewarm", error);
            return;
          }

          if (!shouldHold.current) {
            held.current = false;
            await releasePrewarm();
          }
        })()
      );
      return;
    }
    if (!held.current) return;
    held.current = false;
    ignore(releasePrewarm());
  }, [hold]);
}
