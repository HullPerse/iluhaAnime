import { useCoverCache } from "@/hooks/collection/cache.hook";
import type { CollectionItem } from "@/types/collection";

export function SimilarCard({ item, onClick }: { item: CollectionItem; onClick: () => void }) {
  const { cachedUrl } = useCoverCache(item.coverUrl, item.thumbBlobId ?? item.coverBlobId);
  return (
    <button
      type="button"
      onClick={onClick}
      className="windows95-border hover:bg-surface shrink-0 overflow-hidden bg-field"
    >
      {item.coverUrl && (
        <img src={cachedUrl ?? item.coverUrl} alt="" className="h-20 w-14 object-cover" />
      )}
      <div className="truncate px-1 text-xs">{item.title}</div>
    </button>
  );
}
