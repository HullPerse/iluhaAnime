import { useEffect, useMemo, useState } from "react";

import {
  isChangelogLocaleLoaded,
  loadChangelogLocale,
  translate,
} from "@/lib/locale/i18n.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";
import type { TranslationKey, TranslationVariables } from "@/types/core/i18n";

export function useChangelogLocale(): boolean {
  const [ready, setReady] = useState(isChangelogLocaleLoaded);
  useEffect(() => {
    if (ready) return;
    let active = true;
    loadChangelogLocale()
      .then(() => {
        if (active) setReady(true);
        return null;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ready]);
  return ready;
}

export function useI18n() {
  const locale = useCell(settingsAtoms.language);
  return useMemo(
    () => ({
      locale,
      t: (key: TranslationKey, variables?: TranslationVariables) =>
        translate(key, variables),
    }),
    [locale]
  );
}
