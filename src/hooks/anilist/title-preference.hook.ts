import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { queryKeys } from "@/lib/query/keys.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AnilistRouteData, AniTitleLanguage } from "@/types/anilist";

const TITLE_LANGUAGES: readonly AniTitleLanguage[] = ["romaji", "english", "native"];

function asTitleLanguage(value: unknown): AniTitleLanguage | null {
  return typeof value === "string" && (TITLE_LANGUAGES as readonly string[]).includes(value)
    ? (value as AniTitleLanguage)
    : null;
}

export function useAnimeTitlePreference(): AniTitleLanguage | null {
  const override = useSettingsStore((state) => state.anilistTitleLanguage);
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (override !== "account") return override;
    const data = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
    return asTitleLanguage(data?.user?.title_language);
  }, [override, queryClient]);
}
