import type { RefObject } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionItem, CollectionPage } from "@/types/api/cards";
import type { CardsCollectionSort, CardsSortDir } from "@/types/store/cards";

import type { AlbumMode } from "@/routes/components/collection/albumToolbar.cards";
import BinderCards from "@/routes/components/collection/binder.cards";
import CardGrid, { VirtualCardGrid } from "@/routes/components/collection/cardGrid.cards";
import CollectionShelf from "@/routes/components/collection/collectionShelf.cards";

export default function AlbumBody({
  mode,
  view,
  collection,
  grid,
  scrollRef,
  filtered,
  total,
  page,
  collectionSort,
  collectionSortDir,
  columns,
  pageSize,
  onRetry,
  onOpen,
  onOpenCollection,
}: {
  mode: AlbumMode;
  view: "grid" | "binder";
  collection: {
    isPending: boolean;
    isError: boolean;
    data: CollectionPage | undefined;
  };
  grid: {
    isPending: boolean;
    isError: boolean;
    cards: readonly CollectionItem[];
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    onLoadMore: () => void;
    onRetry: () => void;
    resetKey: string;
    infinite: boolean;
    total: number;
  };
  scrollRef: RefObject<HTMLDivElement | null>;
  filtered: boolean;
  total: number;
  page: number;
  collectionSort: CardsCollectionSort;
  collectionSortDir: CardsSortDir;
  columns: number;
  pageSize: number;
  onRetry: () => void;
  onOpen: (card: CollectionItem) => void;
  onOpenCollection: (animeId: number, kind: "anime" | "manga") => void;
}) {
  const { t } = useI18n();
  const handleGridRetry = () => {
    grid.onRetry();
  };
  const handleLoadMore = () => {
    grid.onLoadMore();
  };
  if (mode === "collections") {
    return (
      <CollectionShelf
        sort={collectionSort}
        sortDir={collectionSortDir}
        onOpen={onOpenCollection}
      />
    );
  }
  if (grid.infinite) {
    if (grid.isPending) {
      return <TabLoader className="min-h-48" />;
    }
    if (grid.isError) {
      return (
        <div className="flex flex-col items-center gap-2 p-6">
          <span className="windows95-text text-destructive text-center" role="alert">
            {t("collection.error")}
          </span>
          <Button onClick={handleGridRetry}>{t("collection.retry")}</Button>
        </div>
      );
    }
    if (grid.cards.length === 0) {
      return (
        <p className="windows95-text text-hint p-2">
          {filtered ? t("collection.empty.filter") : t("collection.album.empty")}
        </p>
      );
    }
    return (
      <VirtualCardGrid
        cards={grid.cards}
        total={grid.total}
        scrollRef={scrollRef}
        hasNextPage={grid.hasNextPage}
        isFetchingNextPage={grid.isFetchingNextPage}
        onLoadMore={handleLoadMore}
        resetKey={grid.resetKey}
        onOpen={onOpen}
      />
    );
  }
  if (collection.isPending) {
    return <TabLoader className="min-h-48" />;
  }
  if (collection.isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.error")}
        </span>
        <Button onClick={onRetry}>{t("collection.retry")}</Button>
      </div>
    );
  }
  const data = collection.data;
  if (data === undefined || data.items.length === 0) {
    return (
      <p className="windows95-text text-hint p-2">
        {filtered ? t("collection.empty.filter") : t("collection.album.empty")}
      </p>
    );
  }
  if (view === "grid") {
    return <CardGrid cards={data.items} onOpen={onOpen} />;
  }
  return (
    <BinderCards
      items={data.items}
      page={page - 1}
      pageCount={Math.max(1, Math.ceil(total / pageSize))}
      columns={columns}
      pageSize={pageSize}
      onOpen={onOpen}
    />
  );
}
