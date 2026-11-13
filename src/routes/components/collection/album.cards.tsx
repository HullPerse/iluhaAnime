import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useMemo, useRef, useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import { CARD_SORTS } from "@/config/cards/labels.config";
import { useBinderColumns } from "@/hooks/cards/binderColumns.hook";
import { useCardsCollection, useCardsCollectionInfinite } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import {
  cardsAtoms,
  setCardsBinderPage,
  setCardsCollectionSort,
  setCardsCollectionSortDir,
  setCardsKind,
  setCardsRarity,
  setCardsSort,
  setCardsSortDir,
} from "@/store/cards.store";
import type { CardKind, CardRarity, CollectionItem } from "@/types/api/cards";
import type { CardsCollectionSort, CardsSortDir } from "@/types/store/cards";

import AlbumBody from "@/routes/components/collection/albumBody.cards";
import AlbumToolbar, { type AlbumMode } from "@/routes/components/collection/albumToolbar.cards";
import CardDetail from "@/routes/components/collection/cardDetail.cards";
import CollectionPageCards from "@/routes/components/collection/collectionPage.cards";

const GRID_PAGE_SIZE = 36;
const GRID_INFINITE_PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 220;
const SUGGESTION_LIMIT = 6;

function suggestionTitles(cards: readonly CollectionItem[]): string[] {
  const titles: string[] = [];
  for (const card of cards) {
    const title = card.title.trim();
    if (title === "" || titles.includes(title)) continue;
    titles.push(title);
    if (titles.length >= SUGGESTION_LIMIT) break;
  }
  return titles;
}

function collectionQueryEnabled(
  mode: AlbumMode,
  view: "grid" | "binder",
  infinite: boolean
) {
  if (mode === "collections") return false;
  return view === "binder" || !infinite;
}

function infiniteQueryEnabled(
  mode: AlbumMode,
  view: "grid" | "binder",
  infinite: boolean
) {
  return mode !== "collections" && view === "grid" && infinite;
}

function activeSortState(
  mode: AlbumMode,
  sort: string,
  sortDir: CardsSortDir,
  collectionSort: CardsCollectionSort,
  collectionSortDir: CardsSortDir
) {
  if (mode === "all") return { sort, sortDir };
  return { sort: collectionSort, sortDir: collectionSortDir };
}

function applySort(mode: AlbumMode, next: string) {
  if (mode === "all") setCardsSort(next as (typeof CARD_SORTS)[number]);
  else setCardsCollectionSort(next as CardsCollectionSort);
}

function applySortDir(mode: AlbumMode, next: CardsSortDir) {
  if (mode === "all") setCardsSortDir(next);
  else setCardsCollectionSortDir(next);
}

function paginationVisible(
  mode: AlbumMode,
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
  const [view, setView] = useState<"grid" | "binder">("grid");
  const [infinite, setInfinite] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [query] = useDebouncedValue(search.trim(), { wait: SEARCH_DEBOUNCE_MS });
  const mode = useCell(cardsAtoms.albumMode);
  const [openCollection, setOpenCollection] = useState<{
    id: number;
    kind: "anime" | "manga";
  } | null>(null);
  const kind = useCell(cardsAtoms.kind);
  const rarity = useCell(cardsAtoms.rarity);
  const sort = useCell(cardsAtoms.sort);
  const sortDir = useCell(cardsAtoms.sortDir);
  const collectionSort = useCell(cardsAtoms.collectionSort);
  const collectionSortDir = useCell(cardsAtoms.collectionSortDir);
  const page = useCell(cardsAtoms.binderPage) + 1;
  const [selected, setSelected] = useState<CollectionItem | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousMode = useRef<AlbumMode>(mode);
  const binder = useBinderColumns(scrollRef);
  const pageSize = view === "binder" ? binder.columns * 3 : GRID_PAGE_SIZE;

  const queryKind = mode === "all" ? kind : null;
  const collection = useCardsCollection(
    {
      kind: queryKind,
      rarity,
      sort,
      sortDir,
      query,
      page,
      pageSize,
    },
    collectionQueryEnabled(mode, view, infinite)
  );
  const grid = useCardsCollectionInfinite(
    {
      kind: queryKind,
      rarity,
      sort,
      sortDir,
      query,
      pageSize: GRID_INFINITE_PAGE_SIZE,
    },
    infiniteQueryEnabled(mode, view, infinite)
  );
  const gridCards = useMemo(
    () => grid.data?.pages.flatMap((page) => page.items) ?? [],
    [grid.data]
  );
  const gridResetKey = `${queryKind ?? ""}:${rarity ?? ""}:${sort}:${sortDir}:${query}`;
  const gridTotal = grid.data?.pages[0]?.total ?? 0;
  const loadMoreGrid = () => grid.fetchNextPage();
  const retryGrid = () => grid.refetch();
  const resetScroll = () => {
    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
  };

  const resetFilters = () => {
    setCardsKind(null);
    setCardsRarity(null);
    setCardsSort("recent");
    resetScroll();
  };

  const changeView = (next: "grid" | "binder") => {
    setView(next);
    if (next === "binder") setInfinite(false);
    setCardsBinderPage(0);
    resetScroll();
  };

  const changeInfinite = (next: boolean) => {
    setInfinite(next);
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
  const loadedCards = infinite && view === "grid" ? gridCards : (data?.items ?? []);
  const suggestions = suggestionTitles(loadedCards);
  const filtered = queryKind !== null || rarity !== null || query !== "";
  const activeSort = activeSortState(mode, sort, sortDir, collectionSort, collectionSortDir);
  const showPagination = paginationVisible(mode, view, infinite, total, data !== undefined);

  const detail =
    selected === null ? null : (
      <CardDetail item={selected} onClose={() => setSelected(null)} />
    );

  if (openCollection !== null) {
    return (
      <>
        <CollectionPageCards
          animeId={openCollection.id}
          collectionKind={openCollection.kind}
          onBack={() => setOpenCollection(null)}
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
        sort={activeSort.sort}
        sortDir={activeSort.sortDir}
        search={search}
        suggestions={suggestions}
        onSearch={changeSearch}
        onKind={changeKind}
        onRarity={changeRarity}
        onSort={changeSort}
        onSortDir={changeSortDir}
        onReset={resetFilters}
        onView={changeView}
        infinite={infinite}
        onInfinite={changeInfinite}
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        <AlbumBody
          mode={mode}
          view={view}
          collection={collection}
          grid={{
            isPending: grid.isPending,
            isError: grid.isError,
            cards: gridCards,
            hasNextPage: grid.hasNextPage,
            isFetchingNextPage: grid.isFetchingNextPage,
            onLoadMore: loadMoreGrid,
            onRetry: retryGrid,
            resetKey: gridResetKey,
            infinite,
            total: gridTotal,
          }}
          scrollRef={scrollRef}
          filtered={filtered}
          total={total}
          page={page}
          collectionSort={collectionSort}
          collectionSortDir={collectionSortDir}
          columns={binder.columns}
          pageSize={pageSize}
          onRetry={() => collection.refetch()}
          onOpen={setSelected}
          onOpenCollection={(id, kind) => setOpenCollection({ id, kind })}
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
