import { anilistMangaMode, trackedManga } from "@/store/anilistManga.store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { buildAnimeBackHandler } from "@/lib/anilist/anilistRoute.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { consumeDeepLink, deeplinkAtoms } from "@/store/deeplink.store";
import type { AniListAnime, AniListCollection } from "@/types/anilist/anilist";

export function useAnilistDetail(lists: AniListCollection[]) {
  const target = useCell(deeplinkAtoms.target);
  const manga = useCell(anilistMangaMode);
  const tracked = useCell(trackedManga);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime>(null);
  const [animeHistory, setAnimeHistory] = useState<AniListAnime[]>([]);
  const [detailFromFilters, setDetailFromFilters] = useState<boolean>(false);
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
    consumeDeepLink();
  }, [target, entryLookup, showDetail]);

  useEffect(() => {
    setSelectedAnime(null);
    setAnimeHistory([]);
  }, [manga]);
  useEffect(() => {
    if (!tracked) return;
    showDetail({ animeId: tracked.id, listEntry: entryLookup.get(tracked.id) }, false);
    trackedManga.set(null);
  }, [tracked, entryLookup, showDetail]);

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
