import { CARD_GRID_INFINITE_PAGE_SIZE } from "@/config/cards/grid.config";
import { useCardsCollection, useCardsCollectionInfinite } from "@/hooks/cards/queries.hook";
import type { CardsCollectionParams } from "@/types/api/cards";
import type { CardsAlbumLayout, CardsAlbumMode } from "@/types/store/cards";

export function useAlbumQueries(
  mode: CardsAlbumMode,
  layout: CardsAlbumLayout,
  filters: Omit<CardsCollectionParams, "page" | "pageSize">,
  page: number,
  pageSize: number
) {
  const infinite = layout === "gridInfinite";
  const collection = useCardsCollection(
    { ...filters, page, pageSize },
    mode === "all" && !infinite
  );
  const grid = useCardsCollectionInfinite(
    { ...filters, pageSize: CARD_GRID_INFINITE_PAGE_SIZE },
    mode === "all" && infinite
  );

  return { collection, grid };
}
