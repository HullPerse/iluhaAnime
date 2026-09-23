import { useCallback, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import type { EntryLookup } from "@/lib/anilist/entries.utils";
import { ALL_LISTS_ID, collectAllEntries } from "@/lib/anilist/group.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { AniListAnime, AniListCollection, AniListFilters } from "@/types/anilist";
import type { FilterPage } from "@/types/ipc";

const FILTER_RANDOM_PER_PAGE = 50;

export function useAnilistRandom(
  lists: AniListCollection[],
  currentList: string,
  entryLookup: EntryLookup,
  showDetail: (anime: AniListAnime, fromFilters: boolean) => void
) {
  const { t } = useI18n();
  const [randomPending, setRandomPending] = useState(false);
  const pendingRef = useRef(false);
  const handleRandomFromList = useCallback(() => {
    const entries =
      currentList === ALL_LISTS_ID
        ? collectAllEntries(lists)
        : (lists.find((l) => l.name === currentList)?.entries ?? []);
    if (entries.length === 0) return;
    const entry = entries[Math.floor(Math.random() * entries.length)];
    if (!entry) return;
    const info = entryLookup.get(entry.media.id);
    showDetail(
      {
        animeId: entry.media.id,
        ...(info && {
          listEntry: {
            progress: info.progress,
            score: info.score,
            list_status: info.list_status,
            notes: info.notes,
          },
        }),
      },
      false
    );
  }, [entryLookup, lists, currentList, showDetail]);
  const handleFilterRandom = async (filters: AniListFilters) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setRandomPending(true);
    await attempt(
      (async () => {
        const baseArgs = {
          ...searchFiltersToParams(filters, null, FILTER_RANDOM_PER_PAGE, 1),
        };
        const [first, firstError] = await attempt(anilistApi.filterPage({ ...baseArgs, page: 1 }));
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
          page === 1 ? [first, null] : await attempt(anilistApi.filterPage({ ...baseArgs, page }));
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
      })()
    );
    pendingRef.current = false;
    setRandomPending(false);
  };
  return { handleFilterRandom, handleRandomFromList, randomPending };
}
