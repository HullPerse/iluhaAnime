import { useMemo } from "react";

import { translate } from "@/lib/locale/i18n.utils";
import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { TranslationKey, TranslationVariables } from "@/types/i18n";

export function useI18n() {
  const locale = useCell(settingsAtoms.language);
  return useMemo(
    () => ({
      locale,
      t: (key: TranslationKey, variables?: TranslationVariables) =>
        translate(locale, key, variables),
    }),
    [locale]
  );
}
