import { useCoverCache } from "@/hooks/collection/cache.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import type { CollectionItem } from "@/types/collection";

export function SimilarCard({ item, onClick }: { item: CollectionItem; onClick: () => void }) {
  const { cachedUrl } = useCoverCache(item.coverUrl, item.thumbBlobId ?? item.coverBlobId);
  return (
    <button
      type="button"
      onClick={onClick}
      className="windows95-border hover:bg-surface bg-field shrink-0 overflow-hidden"
    >
      {cachedUrl ? (
        <img src={cachedUrl} alt="" className="h-20 w-14 object-cover" />
      ) : (
        <img src={generatePlaceholder(item.title)} alt="" className="h-20 w-14 object-cover" />
      )}
      <div className="truncate px-1 text-xs">{item.title}</div>
    </button>
  );
}
