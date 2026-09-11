import { SIMILAR_COUNT } from "@/config/collection/defaults.config";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

export function SimilarCollection({
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
    .slice(0, SIMILAR_COUNT);
  if (similar.length === 0) return null;
  return (
    <div className="windows95-border mt-2 bg-white p-1">
      <strong className="text-xs">{t("collection.details.similar")}</strong>
      <p className="text-hint text-xs">{t("collection.details.similar.hint")}</p>
      <div className="mt-1 flex gap-1 overflow-x-auto">
        {similar.map((rec) => (
          <SimilarCard key={rec.id} item={rec} onClick={() => onOpenItem(rec)} />
        ))}
      </div>
    </div>
  );
}

function SimilarCard({ item, onClick }: { item: CollectionItem; onClick: () => void }) {
  const { cachedUrl } = useCoverCache(item.coverUrl, item.thumbBlobId ?? item.coverBlobId);
  return (
    <button
      type="button"
      onClick={onClick}
      className="windows95-border hover:bg-surface shrink-0 overflow-hidden bg-white"
    >
      {item.coverUrl && (
        <img src={cachedUrl ?? item.coverUrl} alt="" className="h-20 w-14 object-cover" />
      )}
      <div className="truncate px-1 text-xs">{item.title}</div>
    </button>
  );
}
