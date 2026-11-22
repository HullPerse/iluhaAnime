import { useCell } from "@hullperse/hp_utils/react";

import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { settingsAtoms } from "@/store/settings.store";

export function useCardsImageProxy(): string | null {
  const override = useCell(settingsAtoms.cardsImageProxyUrl);
  const anilistProxy = useCell(settingsAtoms.anilistProxyUrl);

  return effectiveProxyUrl(override, anilistProxy);
}
