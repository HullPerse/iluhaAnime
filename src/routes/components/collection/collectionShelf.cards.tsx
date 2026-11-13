import ImageComponent from "@/components/ui/image.component";
import { Button } from "@/components/ui/button.component";
import { useCardsCollections } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { CollectionShelfItem } from "@/types/api/cards";
import type { CardsCollectionSort, CardsSortDir } from "@/types/store/cards";

function ShelfTile({
  item,
  onOpen,
}: {
  item: CollectionShelfItem;
  onOpen: (animeId: number, kind: "anime" | "manga") => void;
}) {
  const { t } = useI18n();
  const title = item.title.trim() === "" ? `Anime #${item.animeId}` : item.title;
  const total = item.total;
  const known = total !== null && total > 0;
  const percent = known ? Math.min(100, Math.round((item.owned / (total || 1)) * 100)) : 0;

  const progressLabel = known
    ? t("collection.shelf.progress", { owned: item.owned, total: total ?? 0 })
    : t("collection.shelf.owned", { count: item.owned });

  return (
    <button
      type="button"
      data-testid="collection-shelf-tile"
      className="cards-shelf-tile"
      onClick={() => onOpen(item.animeId, item.kind === "manga" ? "manga" : "anime")}
    >
      <span className="cards-shelf-window">
        <span className="cards-shelf-bar" title={title}>
          <span>{title}</span>
        </span>
        <span className="cards-shelf-art">
          <ImageComponent
            src={item.coverUrl ?? ""}
            alt={title}
            type="cover"
            className="h-full w-full"
          />
          <span className="cards-shelf-kind">
            {t(item.kind === "manga" ? "collection.kind.manga" : "collection.kind.anime")}
          </span>
        </span>
        <span className="cards-shelf-foot">
          {known && (
            <span
              className="cards-shelf-progress"
              role="progressbar"
              aria-valuenow={item.owned}
              aria-valuemin={0}
              aria-valuemax={total ?? 0}
              aria-valuetext={progressLabel}
            >
              <span className="cards-shelf-progress-fill" style={{ width: `${percent}%` }} />
            </span>
          )}
          <span className="cards-shelf-meta">
            <span className="windows95-text">{progressLabel}</span>
            {known && (
              <span className="windows95-text shrink-0 font-bold tabular-nums">
                {percent}%
              </span>
            )}
          </span>
          <span
            className="cards-shelf-value"
            aria-label={`${t("collection.value")}: ${item.totalValue}`}
            title={`${t("collection.value")}: ${item.totalValue}`}
          >
            <img src="/money.png" alt="" className="chubrik-icon" />
            <span className="tabular-nums">{item.totalValue}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

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
  if (items.length === 0) {
    return <p className="windows95-text text-hint p-2">{t("collection.collections.empty")}</p>;
  }

  return (
    <div data-testid="collection-shelf" className="cards-collection-shelf p-2">
      {items.map((item) => (
        <ShelfTile key={`${item.kind}:${item.animeId}`} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
