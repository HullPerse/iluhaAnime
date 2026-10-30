import { GENRE_PREVIEW_COUNT } from "@/config/anilist/card.config";
import { cardProgressLine } from "@/lib/anilist/cardMeta.utils";
import type { CollectionCardProps } from "@/types/anilist/collection";

export function CardMetaLine({
  item,
  shortMeta,
}: {
  item: CollectionCardProps["item"];
  shortMeta: boolean;
}) {
  return (
    <div className="text-hint flex items-center gap-1 truncate text-xs leading-none">
      {!shortMeta && item.year != null && <span className="shrink-0">{item.year}</span>}
      {!shortMeta && item.genres[0] && (
        <span
          className="min-w-0 truncate"
          title={item.genres.slice(0, GENRE_PREVIEW_COUNT).join(", ")}
        >
          {item.genres.slice(0, GENRE_PREVIEW_COUNT).join(", ")}
        </span>
      )}
      <span className="ml-auto shrink-0 font-bold">{cardProgressLine(item)}</span>
    </div>
  );
}
