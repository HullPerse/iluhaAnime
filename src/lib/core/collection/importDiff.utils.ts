import { entryDiffers } from "@/lib/core/collection/import.utils";
import type { AniListCollection, AniListEntry } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { CollectionItem } from "@/types/anilist/collection";

export interface ImportDiff {
  itemByAnilistId: Map<number, CollectionItem>;
  existingAnilistIds: Set<number>;
  existingTitles: Set<string>;
  allEntries: AniListEntry[];
  newEntries: AniListEntry[];
  changedEntries: AniListEntry[];
  existingCount: number;
  backfillTargets: CollectionItem[];
}

export function buildImportDiff({
  lists,
  items,
  scoreFormat,
}: {
  lists: AniListCollection[];
  items: CollectionItem[];
  scoreFormat: AnilistScoreFormat;
}): ImportDiff {
  const itemByAnilistId = new Map<number, CollectionItem>();
  const existingAnilistIds = new Set<number>();
  const existingTitles = new Set<string>();

  for (const item of items) {
    const anilistId = item.externalIds.anilist;
    if (anilistId != null) itemByAnilistId.set(anilistId, item);
    if (typeof anilistId === "number") existingAnilistIds.add(anilistId);
    existingTitles.add(item.title.trim().toLocaleLowerCase());
  }

  const allEntries = lists.flatMap((list) => list.entries);
  const newEntries = allEntries.filter(
    (entry) =>
      !existingAnilistIds.has(entry.media.id) &&
      !existingTitles.has(entry.media.title.trim().toLocaleLowerCase())
  );
  const changedEntries = allEntries.filter((entry) => {
    const item = itemByAnilistId.get(entry.media.id);
    return item !== undefined && entryDiffers(entry, item, scoreFormat);
  });

  return {
    itemByAnilistId,
    existingAnilistIds,
    existingTitles,
    allEntries,
    newEntries,
    changedEntries,
    existingCount: allEntries.length - newEntries.length,
    backfillTargets: items.filter((item) => item.externalIds.anilist != null),
  };
}
