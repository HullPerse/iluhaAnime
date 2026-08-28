import { useCoverCache } from "@/hooks/coverCache.hook";
import { useI18n } from "@/lib/i18n";
import type { CollectionItem } from "@/types/collection";

export function SimilarItemsRow({
  items,
  item,
  onOpenItem,
}: {
  items: CollectionItem[];
  item: CollectionItem;
  onOpenItem: (item: CollectionItem) => void;
}) {
  const { t } = useI18n();
  const similar = items
    .filter((i) => i.id !== item.id && i.type === item.type)
    .slice(0, 4);
  return (
    <div className="windows95-border mt-2 bg-white p-1">
      <strong className="text-xs">{t("collection.details.similar")}</strong>
      <p className="text-hint text-xs">{t("collection.details.similarHint")}</p>
      <div className="mt-1 flex gap-1 overflow-x-auto">
        {similar.map((rec) => (
          <SimilarCard
            key={rec.id}
            item={rec}
            onClick={() => onOpenItem(rec)}
          />
        ))}
      </div>
    </div>
  );
}

export function SimilarCard({
  item,
  onClick,
}: {
  item: CollectionItem;
  onClick: () => void;
}) {
  const { cachedUrl } = useCoverCache(item.coverUrl, item.coverBlobId);
  return (
    <button
      type="button"
      onClick={onClick}
      className="windows95-border hover:bg-surface shrink-0 overflow-hidden bg-white"
    >
      {item.coverUrl && (
        <img
          src={cachedUrl ?? item.coverUrl}
          alt=""
          className="h-20 w-14 object-cover"
        />
      )}
      <div className="truncate px-1 text-xs">{item.title}</div>
    </button>
  );
}