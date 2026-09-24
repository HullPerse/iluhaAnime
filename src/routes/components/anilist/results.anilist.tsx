import type { EntryLookup } from "@/lib/anilist/entries.utils";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import AniListEntryCard from "@/routes/components/anilist/card.anilist";
import type { AniListAnime, AniMedia } from "@/types/anilist";

import AniListResultsPagination from "./resultsPagination.anilist";

export default function AniListResults({
  entries,
  entryLookup,
  favouriteIds,
  scoreFormat,
  onSelect,
  scrollRef,
  showPagination,
  pagination,
}: {
  entries: AniMedia[];
  entryLookup: EntryLookup;
  favouriteIds: Set<number>;
  scoreFormat?: AnilistScoreFormat | null;
  onSelect: (anime: AniListAnime) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
  showPagination: boolean;
  pagination: React.ComponentProps<typeof AniListResultsPagination>;
}) {
  return (
    <>
      {entries.length > 0 && (
        <section
          className="windows95-border bg-field flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto border p-1"
          ref={scrollRef}
        >
          {entries.map((item) => (
            <AniListEntryCard
              key={item.id}
              item={item}
              entryLookup={entryLookup}
              isFavorite={favouriteIds.has(item.id)}
              scoreFormat={scoreFormat}
              onClick={onSelect}
            />
          ))}
        </section>
      )}

      {showPagination && <AniListResultsPagination {...pagination} />}
    </>
  );
}
