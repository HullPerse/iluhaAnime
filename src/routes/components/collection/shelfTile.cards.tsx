import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionShelfItem } from "@/types/api/cards";

export default function ShelfTile({
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
          <span
            className="cards-shelf-progress"
            role="progressbar"
            aria-valuenow={known ? item.owned : undefined}
            aria-valuemin={0}
            aria-valuemax={known ? total : undefined}
            aria-valuetext={progressLabel}
          >
            <span className="cards-shelf-progress-fill" style={{ width: `${percent}%` }} />
          </span>
          <span className="cards-shelf-meta">
            <span className="windows95-text">{progressLabel}</span>
            {known && (
              <span className="windows95-text shrink-0 font-bold tabular-nums">{percent}%</span>
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
