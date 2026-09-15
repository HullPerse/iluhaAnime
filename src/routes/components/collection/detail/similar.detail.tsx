import { SIMILAR_COUNT } from "@/config/collection/defaults.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

import { SimilarCard } from "./similarCard.detail";

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
    <div className="windows95-border bg-field mt-2 p-1">
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
