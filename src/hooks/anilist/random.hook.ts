import { useCallback, useRef, useState } from "react";

import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListAnime, AniListCollection, AniListFilters } from "@/types/anilist";
import type { FilterPage } from "@/types/ipc";

const FILTER_RANDOM_PER_PAGE = 50;

export function useAnilistRandom(
  lists: AniListCollection[],
  currentList: string,
  entryLookup: Map<number, { progress: number | null; score: number | null; list_status: string }>,
  showDetail: (anime: AniListAnime, fromFilters: boolean) => void
) {
  const { t } = useI18n();
  const [randomPending, setRandomPending] = useState(false);
  const pendingRef = useRef(false);
  const handleRandomFromList = useCallback(() => {
    const list = lists.find((l) => l.name === currentList);
    if (!list?.entries.length) return;
    const idx = Math.floor(Math.random() * list.entries.length);
    const entry = list.entries[idx];
    if (!entry) return;
    showDetail(
      {
        animeId: entry.media.id,
        listEntry: {
          progress: entry.progress,
          score: entry.score,
          list_status: entry.list_status,
        },
      },
      false
    );
  }, [lists, currentList, showDetail]);
  const handleFilterRandom = async (filters: AniListFilters) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setRandomPending(true);
    try {
      const baseArgs = {
        ...searchFiltersToParams(filters, null, FILTER_RANDOM_PER_PAGE, 1),
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      };
      const [first, firstError] = await attempt(
        invokeTyped<FilterPage>("get_anilist_filter_page", { ...baseArgs, page: 1 })
      );
      if (firstError || !first) {
        showError(t("anilist.filters.random"), t("anilist.filters.random.error"));
        return;
      }
      if (first.total === 0) {
        showError(t("anilist.filters.random"), t("anilist.filters.random.empty"));
        return;
      }
      const pages = Math.max(1, Math.ceil(first.total / FILTER_RANDOM_PER_PAGE));
      const page = 1 + Math.floor(Math.random() * pages);
      const [pageData, pageError]: [FilterPage | null, Error | null] =
        page === 1
          ? [first, null]
          : await attempt(
              invokeTyped<FilterPage>("get_anilist_filter_page", { ...baseArgs, page })
            );
      const pool = pageData?.media ?? [];
      const pick = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : undefined;
      if (pageError || !pick) {
        showError(
          t("anilist.filters.random"),
          t(pageError ? "anilist.filters.random.error" : "anilist.filters.random.empty")
        );
        return;
      }
      showDetail({ animeId: pick.id, listEntry: entryLookup.get(pick.id) }, true);
    } finally {
      pendingRef.current = false;
      setRandomPending(false);
    }
  };
  return { handleFilterRandom, handleRandomFromList, randomPending };
}
