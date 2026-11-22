import { Button } from "@/components/ui/button.component";
import { useCardsCollections } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";

import ShelfTile from "@/routes/components/collection/shelfTile.cards";
import type { CardsCollectionSort, CardsSortDir } from "@/types/store/cards";

export default function CollectionShelf({
  sort,
  sortDir,
  onOpen,
}: {
  sort: CardsCollectionSort;
  sortDir: CardsSortDir;
  onOpen: (animeId: number, kind: "anime" | "manga") => void;
}) {
  const { t } = useI18n();
  const collections = useCardsCollections(sort, sortDir);

  if (collections.isPending) {
    return <p className="windows95-text text-hint p-2">{t("collection.loading")}</p>;
  }

  if (collections.isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.error")}
        </span>
        <Button onClick={() => ignore(collections.refetch())}>{t("collection.retry")}</Button>
      </div>
    );
  }

  const items = collections.data ?? [];

  if (items.length === 0) return null;

  return (
    <div data-testid="collection-shelf" className="cards-collection-shelf p-2">
      {items.map((item) => (
        <ShelfTile key={`${item.kind}:${item.animeId}`} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
