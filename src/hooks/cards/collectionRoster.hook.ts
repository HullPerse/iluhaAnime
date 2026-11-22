import { useEffect, useMemo, useState } from "react";

import { useCardsCollectionRoster } from "@/hooks/cards/queries.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { mergeRoster } from "@/lib/cards/roster.utils";
import type { AnimeCollectionPage } from "@/types/api/cards";
import type { CollectionSlot } from "@/types/ui/collection";

const PREFETCH_PAGES = 2;

export function useCollectionRoster(
  animeId: number,
  collectionKind: "anime" | "manga",
  collectionData: AnimeCollectionPage | undefined,
  pageSize: number
) {
  const collectionIdentity = `${animeId}:${collectionKind}`;
  const [pagination, setPagination] = useState<{ identity: string; index: number }>({
    identity: collectionIdentity,
    index: 0,
  });
  const page = pagination.identity === collectionIdentity ? pagination.index : 0;
  const firstPage = collectionData?.rosterHasMore ? collectionData.rosterPage + 1 : null;
  const { data, fetchNextPage, hasNextPage, isError, isFetching, refetch } =
    useCardsCollectionRoster(animeId, collectionKind, firstPage);

  useEffect(() => {
    setPagination((current) =>
      current.identity === collectionIdentity ? current : { identity: collectionIdentity, index: 0 }
    );
  }, [collectionIdentity]);

  const roster = useMemo(
    () =>
      mergeRoster(
        collectionData?.roster ?? [],
        data?.pages.flatMap((entry) => entry.characters) ?? []
      ),
    [collectionData?.roster, data]
  );

  const slots = useMemo<CollectionSlot[]>(() => {
    if (collectionData === undefined) return [];
    const characterItems = collectionData.items.filter((item) => item.kind === "character");
    const owned = characterItems.map<CollectionSlot>((card) => ({ kind: "owned", card }));
    const ownedCharacters = new Set(characterItems.map((item) => item.entityId));
    const missing = roster
      .filter((character) => !character.owned && !ownedCharacters.has(character.entityId))
      .map<CollectionSlot>((character) => ({
        kind: "missing",
        entityId: character.entityId,
      }));

    return [...owned, ...missing];
  }, [collectionData, roster]);

  const pageCount = Math.max(1, Math.ceil(slots.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const nearEnd = currentPage >= pageCount - PREFETCH_PAGES;

  useEffect(() => {
    if (!nearEnd || !hasNextPage || isFetching || isError) return;
    ignore(fetchNextPage({ cancelRefetch: false }));
  }, [fetchNextPage, hasNextPage, isError, isFetching, nearEnd]);

  return {
    roster,
    slots,
    pageCount,
    currentPage,
    loading: isFetching,
    failed: isError,
    busy: isFetching,
    hasMore: data === undefined ? firstPage !== null : hasNextPage,
    retry: data === undefined ? refetch : fetchNextPage,
    requestMore: fetchNextPage,
    goToPage(index: number) {
      setPagination({ identity: collectionIdentity, index });
    },
  };
}
