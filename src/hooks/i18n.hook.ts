import { useMemo } from "react";

import { translate } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { TranslationKey, TranslationVariables } from "@/types/i18n";

export function useI18n() {
  const locale = useSettingsStore((state) => state.language);
  return useMemo(
    () => ({
      locale,
      t: (key: TranslationKey, variables?: TranslationVariables) =>
        translate(locale, key, variables),
    }),
    [locale]
  );
}
