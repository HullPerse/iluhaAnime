import type { AniListCollection, AniListEntry, AniListGroup } from "@/types/anilist";

export function groupEntriesByList(
  entries: AniListEntry[],
  lists: AniListCollection[]
): AniListGroup[] {
  const owner = new Map<number, string>();
  for (const list of lists) {
    for (const entry of list.entries) {
      if (!owner.has(entry.media.id)) owner.set(entry.media.id, list.name);
    }
  }
  const seen = new Set<number>();
  const buckets = new Map<string, AniListEntry[]>();
  for (const entry of entries) {
    const id = entry.media.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = owner.get(id);
    if (!name) continue;
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = [];
      buckets.set(name, bucket);
    }
    bucket.push(entry);
  }
  const rank = new Map(lists.map((list, index) => [list.name, index]));
  return [...buckets]
    .sort((a, b) => (rank.get(a[0]) ?? lists.length) - (rank.get(b[0]) ?? lists.length))
    .map(([name, groupEntries]) => ({ name, entries: groupEntries }));
}

export const ALL_LISTS_ID = "__all";

export function collectAllEntries(lists: AniListCollection[]): AniListEntry[] {
  const seen = new Set<number>();
  const out: AniListEntry[] = [];
  for (const list of lists) {
    for (const entry of list.entries) {
      if (seen.has(entry.media.id)) continue;
      seen.add(entry.media.id);
      out.push(entry);
    }
  }
  return out;
}

export function activeListEntries(lists: AniListCollection[], currentList: string): AniListEntry[] {
  if (currentList === ALL_LISTS_ID) return collectAllEntries(lists);
  return lists.find((list) => list.name === currentList)?.entries ?? [];
}
