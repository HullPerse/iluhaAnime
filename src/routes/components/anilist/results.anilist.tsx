import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import AniListEntryCard from "@/routes/components/anilist/card.anilist";
import type { AniListAnime, AniMedia } from "@/types/anilist";

import AniListResultsPagination from "./resultsPagination.anilist";

export default function AniListResults({
  entries,
  entryLookup,
  onSelect,
  scrollRef,
  showPagination,
  pagination,
}: {
  entries: AniMedia[];
  entryLookup: ReturnType<typeof buildEntryLookup>;
  onSelect: (anime: AniListAnime) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
  showPagination: boolean;
  pagination: React.ComponentProps<typeof AniListResultsPagination>;
}) {
  return (
    <>
      {entries.length > 0 && (
        <section
          className="windows95-border flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto border bg-white p-1"
          ref={scrollRef}
        >
          {entries.map((item) => (
            <AniListEntryCard
              key={item.id}
              item={item}
              entryLookup={entryLookup}
              onClick={onSelect}
            />
          ))}
        </section>
      )}

      {showPagination && <AniListResultsPagination {...pagination} />}
    </>
  );
}
