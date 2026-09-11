import { useCallback, useEffect, useMemo, useState } from "react";

import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { buildAnimeBackHandler } from "@/lib/anilist/route.utils";
import { useDeepLinkStore } from "@/store/deeplink.store";
import type { AniListAnime, AniListCollection } from "@/types/anilist";

export function useAnilistDetail(lists: AniListCollection[]) {
  const target = useDeepLinkStore((state) => state.target);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime>(null);
  const [animeHistory, setAnimeHistory] = useState<AniListAnime[]>([]);
  const [detailFromFilters, setDetailFromFilters] = useState(false);
  const entryLookup = useMemo(() => buildEntryLookup(lists), [lists]);
  const showDetail = useCallback((anime: AniListAnime, fromFilters: boolean) => {
    setDetailFromFilters(fromFilters);
    setSelectedAnime(anime);
  }, []);
  const openAnimeFromLookup = useCallback(
    (id: number) => {
      showDetail({ animeId: id, listEntry: entryLookup.get(id) }, false);
    },
    [entryLookup, showDetail]
  );
  const historyBack = useMemo(
    () => buildAnimeBackHandler(animeHistory, setAnimeHistory, setSelectedAnime),
    [animeHistory]
  );
  const handleAnimeBack = useMemo(() => {
    if (historyBack) return historyBack;
    if (!detailFromFilters) return undefined;
    return () => setSelectedAnime(null);
  }, [historyBack, detailFromFilters]);
  const handleRelated = useCallback(
    (id: number) => {
      setAnimeHistory((prev) => (selectedAnime ? [...prev, selectedAnime] : prev));
      setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
    },
    [selectedAnime, entryLookup]
  );
  const handleDetailsClose = useCallback(() => {
    setSelectedAnime(null);
    setAnimeHistory([]);
    setDetailFromFilters(false);
  }, []);
  useEffect(() => {
    if (!target) return;
    showDetail({ animeId: target.id, listEntry: entryLookup.get(target.id) }, false);
    useDeepLinkStore.getState().consume();
  }, [target, entryLookup, showDetail]);
  return {
    detailFromFilters,
    entryLookup,
    handleAnimeBack,
    handleDetailsClose,
    handleRelated,
    openAnimeFromLookup,
    selectedAnime,
    showDetail,
  };
}
