import { keepPreviousData } from "@tanstack/react-query";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";

import { cardsApi } from "@/api/cards.api";
import { useAppInfiniteQuery, useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { CardsCollectionSort, CardsSortDir } from "@/types/store/cards";
import type {
  AnimeCollectionPage,
  CardPackRow,
  CardsBootstrap,
  CardsCollectionParams,
  CardsStats,
  CardsUnread,
  CollectionPage,
  CollectionRosterPage,
  CollectionShelfItem,
  CollectionItem,
} from "@/types/api/cards";

function anilistProxy(): string {
  return settingsAtoms.anilistProxyUrl.get() ?? "";
}

export function useCardsBootstrap() {
  return useAppQuery<CardsBootstrap>("static", {
    queryKey: queryKeys.cardsBootstrap(),
    queryFn: () => cardsApi.bootstrap(),
  });
}

export function useCardsPacks() {
  const proxy = anilistProxy();
  return useAppQuery<CardPackRow[]>("slow", {
    queryKey: queryKeys.cardsPacks(proxy),
    queryFn: () => cardsApi.packs(),
  });
}

export function useCardsCollection(params: CardsCollectionParams = {}, enabled = true) {
  const proxy = anilistProxy();
  return useAppQuery<CollectionPage>("slow", {
    queryKey: queryKeys.cardsCollection(params, proxy),
    queryFn: () => cardsApi.collection(params, proxy || null),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCardsCollectionInfinite(
  params: Omit<CardsCollectionParams, "page"> = {},
  enabled = true
) {
  const proxy = anilistProxy();
  return useAppInfiniteQuery<
    CollectionPage,
    Error,
    InfiniteData<CollectionPage>,
    QueryKey,
    number
  >("slow", {
    queryKey: queryKeys.cardsCollectionInfinite(params, proxy),
    queryFn: ({ pageParam }) => cardsApi.collection({ ...params, page: pageParam }, proxy || null),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
    // Re-sorting keeps the current rows on screen instead of blanking the grid
    // and snapping back to the top of an empty list.
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCardsCollections(sort: CardsCollectionSort, sortDir: CardsSortDir) {
  const proxy = anilistProxy();
  return useAppQuery<CollectionShelfItem[]>("slow", {
    queryKey: queryKeys.cardsCollections(sort, sortDir, proxy),
    queryFn: () => cardsApi.collections(sort, sortDir, proxy || null),
    placeholderData: keepPreviousData,
  });
}

export function useCardsCardVariants(kind: CollectionItem["kind"], entityId: number) {
  return useAppQuery<CollectionItem[]>("slow", {
    queryKey: queryKeys.cardsCardVariants(kind, entityId),
    queryFn: () => cardsApi.cardVariants(kind, entityId),
    placeholderData: keepPreviousData,
  });
}

export function useCardsAnimeCollection(
  animeId: number | null,
  kind: "anime" | "manga" = "anime"
) {
  const proxy = anilistProxy();
  return useAppQuery<AnimeCollectionPage>("slow", {
    queryKey: queryKeys.cardsAnimeCollection(animeId ?? 0, kind, proxy),
    queryFn: () => cardsApi.animeCollection(animeId ?? 0, kind, proxy || null),
    enabled: animeId !== null && animeId > 0,
  });
}

export function useCardsCollectionRoster(
  mediaId: number,
  kind: "anime" | "manga",
  page: number | null
) {
  const proxy = anilistProxy();
  return useAppQuery<CollectionRosterPage>("slow", {
    queryKey: queryKeys.cardsCollectionRoster(mediaId, kind, page ?? 0, proxy),
    queryFn: () => cardsApi.collectionRoster(mediaId, kind, page ?? 1, proxy || null),
    enabled: page !== null,
  });
}

export function useCardsUnread(packsSince: number, cardsSince: number) {
  return useAppQuery<CardsUnread>("static", {
    queryKey: queryKeys.cardsUnread(packsSince, cardsSince),
    queryFn: () => cardsApi.unread(packsSince, cardsSince),
  });
}

export function useCardsStats() {
  return useAppQuery<CardsStats>("slow", {
    queryKey: queryKeys.cardsStats(),
    queryFn: () => cardsApi.stats(),
  });
}
