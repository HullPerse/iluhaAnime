import { useCallback } from "react";

import type { EntryLookup } from "@/lib/anilist/entries.utils";
import { ALL_LISTS_ID, collectAllEntries } from "@/lib/anilist/group.utils";
import type { AniListAnime, AniListCollection } from "@/types/anilist";

export function useAnilistRandom(
  lists: AniListCollection[],
  currentList: string,
  entryLookup: EntryLookup,
  showDetail: (anime: AniListAnime, fromFilters: boolean) => void
) {
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
  return { handleRandomFromList };
}
