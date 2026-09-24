import type { EntryLookup } from "@/lib/anilist/entries.utils";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import AniListScrollView from "@/routes/components/anilist/scroll.anilist";
import type { AniListAnime, AniListGroup, AniMedia } from "@/types/anilist";

import AniListResults from "./results.anilist";
import type AniListResultsPagination from "./resultsPagination.anilist";

export default function AniListResultsHost({
  scroll,
  items,
  pagedEntries,
  entryLookup,
  favouriteIds,
  scoreFormat,
  onSelect,
  scrollRef,
  showPagination,
  pagination,
  groups,
  collapsedLists,
  onToggleListCollapsed,
}: {
  scroll: boolean;
  items: AniMedia[];
  pagedEntries: AniMedia[];
  entryLookup: EntryLookup;
  favouriteIds: Set<number>;
  scoreFormat?: AnilistScoreFormat | null;
  onSelect: (anime: AniListAnime) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
  showPagination: boolean;
  pagination: React.ComponentProps<typeof AniListResultsPagination>;
  groups: AniListGroup[] | null;
  collapsedLists: Set<string>;
  onToggleListCollapsed: (name: string) => void;
}) {
  if (scroll || groups?.length)
    return (
      <AniListScrollView
        items={items}
        entryLookup={entryLookup}
        favouriteIds={favouriteIds}
        scoreFormat={scoreFormat}
        onSelect={onSelect}
        groups={groups ?? undefined}
        collapsedLists={collapsedLists}
        onToggleListCollapsed={onToggleListCollapsed}
      />
    );
  return (
    <AniListResults
      entries={pagedEntries}
      entryLookup={entryLookup}
      favouriteIds={favouriteIds}
      scoreFormat={scoreFormat}
      onSelect={onSelect}
      scrollRef={scrollRef}
      showPagination={showPagination}
      pagination={pagination}
    />
  );
}
