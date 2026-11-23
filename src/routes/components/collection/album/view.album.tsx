import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useMemo, useRef, useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import { CARD_GRID_PAGE_SIZE, CARD_GRID_SEARCH_DEBOUNCE_MS } from "@/config/cards/grid.config";
import { cardImageUrls, suggestionTitles } from "@/lib/cards/album.utils";
import { isCardsCollectionSort, isCardsSort } from "@/lib/cards/guards.utils";
import { useBinderColumns } from "@/hooks/cards/binderColumns.hook";
import { useCardsImageProxy } from "@/hooks/cards/imageProxy.hook";
import { useAlbumImagePrefetch } from "@/hooks/cards/albumImagePrefetch.hook";
import { useAlbumQueries } from "@/hooks/cards/albumQueries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { cancelRemoteImageQueue, setRemoteImageScope } from "@/hooks/remoteImage.hook";
import {
  cardsAtoms,
  setCardsBinderPage,
  setCardsCollectionSort,
  setCardsCollectionSortDir,
  setCardsKind,
  setCardsRarity,
  setCardsSort,
  setCardsSortDir,
  setCardsVariant,
} from "@/store/cards.store";
import type { CardKind, CardRarity, CardVariant, CollectionItem } from "@/types/api/cards";
import type {
  CardsAlbumLayout,
  CardsAlbumMode,
  CardsCollectionSort,
  CardsSortDir,
} from "@/types/store/cards";

import AlbumBody from "@/routes/components/collection/album/body.album";
import AlbumToolbar from "@/routes/components/collection/album/toolbar.album";
import CardDetail from "@/routes/components/collection/cardDetail.cards";
import CollectionPageCards from "@/routes/components/collection/collectionPage.cards";

function activeSortState(
  mode: CardsAlbumMode,
  sort: string,
  sortDir: CardsSortDir,
  collectionSort: CardsCollectionSort,
  collectionSortDir: CardsSortDir
) {
  if (mode === "all") return { sort, sortDir };

  return { sort: collectionSort, sortDir: collectionSortDir };
}

function applySort(mode: CardsAlbumMode, next: string) {
  if (mode === "all") {
    if (isCardsSort(next)) setCardsSort(next);

    return;
  }

  if (isCardsCollectionSort(next)) setCardsCollectionSort(next);
}

function applySortDir(mode: CardsAlbumMode, next: CardsSortDir) {
  if (mode === "all") setCardsSortDir(next);
  else setCardsCollectionSortDir(next);
}

function paginationVisible(
  mode: CardsAlbumMode,
  view: "grid" | "binder",
  infinite: boolean,
  total: number,
  hasData: boolean
) {
  if (mode === "collections" || !hasData || total <= 0) return false;

  return view === "binder" || !infinite;
}

export default function AlbumCards() {
  const { t } = useI18n();
  const imageProxy = useCardsImageProxy();
  const [layout, setLayout] = useState<CardsAlbumLayout>("grid");
  const view = layout === "binder" ? "binder" : "grid";
  const infinite = layout === "gridInfinite";
  const [search, setSearch] = useState<string>("");
  const [query] = useDebouncedValue(search.trim(), { wait: CARD_GRID_SEARCH_DEBOUNCE_MS });
  const mode = useCell(cardsAtoms.albumMode);
  const [openCollection, setOpenCollection] = useState<{
    id: number;
    kind: "anime" | "manga";
  } | null>(null);
  const kind = useCell(cardsAtoms.kind);
  const rarity = useCell(cardsAtoms.rarity);
  const variant = useCell(cardsAtoms.variant);
  const sort = useCell(cardsAtoms.sort);
  const sortDir = useCell(cardsAtoms.sortDir);
  const collectionSort = useCell(cardsAtoms.collectionSort);
  const collectionSortDir = useCell(cardsAtoms.collectionSortDir);
  const page = useCell(cardsAtoms.binderPage) + 1;
  const [selected, setSelected] = useState<CollectionItem | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousMode = useRef<CardsAlbumMode>(mode);
  const binder = useBinderColumns(scrollRef);
  const pageSize = view === "binder" ? binder.columns * 3 : CARD_GRID_PAGE_SIZE;

  const queryKind = mode === "all" ? kind : null;
  const { collection, grid } = useAlbumQueries(
    mode,
    layout,
    { kind: queryKind, rarity, variant, sort, sortDir, query },
    page,
    pageSize
  );
  const gridCards = useMemo(
    () => grid.data?.pages.flatMap((page) => page.items) ?? [],
    [grid.data]
  );
  const gridResetKey = `${queryKind ?? ""}:${rarity ?? ""}:${variant ?? ""}:${sort}:${sortDir}:${query}`;
  const gridTotal = grid.data?.pages[0]?.total ?? 0;
  const retryGrid = () => grid.refetch();
  const resetScroll = () => {
    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
  };

  const resetFilters = () => {
    setCardsKind(null);
    setCardsRarity(null);
    setCardsVariant(null);
    setCardsSort("recent");
    resetScroll();
  };

  const changeView = (next: "grid" | "binder") => {
    setLayout(next === "grid" && infinite ? "gridInfinite" : next);
    setCardsBinderPage(0);
    resetScroll();
  };

  const changeInfinite = (next: boolean) => {
    if (view === "grid") setLayout(next ? "gridInfinite" : "grid");
    setCardsBinderPage(0);
    resetScroll();
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setCardsBinderPage(0);
    resetScroll();
  };

  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    setOpenCollection(null);

    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
  }, [mode]);

  const changeKind = (next: CardKind | null) => {
    setCardsKind(next);
    resetScroll();
  };

  const changeRarity = (next: CardRarity | null) => {
    setCardsRarity(next);
    resetScroll();
  };

  const changeVariant = (next: CardVariant | null) => {
    setCardsVariant(next);
    resetScroll();
  };

  const changeSort = (next: string) => {
    applySort(mode, next);
    resetScroll();
  };

  const changeSortDir = (next: CardsSortDir) => {
    applySortDir(mode, next);
    resetScroll();
  };

  const data = collection.data;
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const loadedCards = useMemo(
    () => (infinite && view === "grid" ? gridCards : (data?.items ?? [])),
    [data?.items, gridCards, infinite, view]
  );
  const suggestions = suggestionTitles(loadedCards);
  const onVisibleCardsChange = useAlbumImagePrefetch(loadedCards, mode, infinite, imageProxy);
  const activeSort = activeSortState(mode, sort, sortDir, collectionSort, collectionSortDir);
  const showPagination = paginationVisible(mode, view, infinite, total, data !== undefined);

  const openCollectionPage = (animeId: number, kind: "anime" | "manga") => {
    setRemoteImageScope(null);
    cancelRemoteImageQueue();
    setOpenCollection({ id: animeId, kind });
  };

  const detail =
    selected === null ? null : <CardDetail item={selected} onClose={() => setSelected(null)} />;

  if (openCollection !== null) {
    return (
      <>
        <CollectionPageCards
          animeId={openCollection.id}
          collectionKind={openCollection.kind}
          onBack={() => {
            setOpenCollection(null);
            setRemoteImageScope(cardImageUrls(loadedCards));
          }}
          onOpenCard={setSelected}
        />
        {detail}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AlbumToolbar
        mode={mode}
        view={view}
        kind={kind}
        rarity={rarity}
        variant={variant}
        sort={activeSort.sort}
        sortDir={activeSort.sortDir}
        search={search}
        suggestions={suggestions}
        onSearch={changeSearch}
        onKind={changeKind}
        onRarity={changeRarity}
        onVariant={changeVariant}
        onSort={changeSort}
        onSortDir={changeSortDir}
        onReset={resetFilters}
        onView={changeView}
        infinite={infinite}
        onInfinite={changeInfinite}
      />
      <div
        ref={scrollRef}
        className="scroll-edge-fade min-h-0 flex-1 [scrollbar-gutter:stable] overflow-x-clip overflow-y-auto p-2"
      >
        <AlbumBody
          mode={mode}
          view={view}
          hasFilters={queryKind !== null || rarity !== null || variant !== null || query !== ""}
          collection={collection}
          grid={{
            isPending: grid.isPending,
            isError: grid.isError,
            cards: gridCards,
            hasNextPage: grid.hasNextPage,
            isFetchingNextPage: grid.isFetchingNextPage,
            onLoadMore: grid.fetchNextPage,
            onRetry: retryGrid,
            resetKey: gridResetKey,
            infinite,
            total: gridTotal,
          }}
          scrollRef={scrollRef}
          total={total}
          page={page}
          collectionSort={collectionSort}
          collectionSortDir={collectionSortDir}
          columns={binder.columns}
          pageSize={pageSize}
          onRetry={() => collection.refetch()}
          onOpen={setSelected}
          onOpenCollection={openCollectionPage}
          onVisibleCardsChange={onVisibleCardsChange}
        />
      </div>
      {showPagination && (
        <Pagination
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={(next) => setCardsBinderPage(next - 1)}
          statusText={t("collection.album.page", { page })}
          scrollRef={scrollRef}
        />
      )}
      {detail}
    </div>
  );
}
