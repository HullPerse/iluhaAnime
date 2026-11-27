import { anilistMangaMode } from "@/store/anilistManga.store";
import { mangaListStatuses } from "@/config/manga/tracking.config";
import { useEffect, useMemo, useState } from "react";

import { isChangelogLocaleLoaded, loadChangelogLocale, translate } from "@/lib/locale/i18n.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";
import type { TranslationKey, TranslationVariables } from "@/types/core/i18n";

export function useChangelogLocale(): boolean {
  const [ready, setReady] = useState<boolean>(isChangelogLocaleLoaded);
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
  const manga = useCell(anilistMangaMode);

  return useMemo(
    () => ({
      locale,
      t: (key: TranslationKey, variables?: TranslationVariables) => {
        if (manga && key.startsWith("anilist.list.status.")) {
          const status = mangaListStatuses.find(([id]) => key.endsWith(id));

          if (status) return translate(status[1], variables);
        }

        if (manga && key === "anilist.route.search.placeholder")
          return translate("manga.search.query", variables);

        if (manga && key === "anilist.header.anime.count")
          return `${variables?.count ?? 0} манги, ${variables?.episodes ?? 0} гл.`;

        if (manga && key === "anilist.details.eps.short") return "гл.";

        return translate(key, variables);
      },
    }),
    [locale, manga]
  );
}
