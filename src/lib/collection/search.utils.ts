import { normalizeSearchText } from "@/lib/search/normalize.utils";
import type { CollectionItem, CollectionSearchIndex } from "@/types/collection";

export function buildCollectionSearchIndex(items: CollectionItem[]): CollectionSearchIndex {
  const byToken = new Map<string, Set<number>>();
  const normalized = items.map((item, index) => {
    const peopleNames = [
      ...(item.detailsJson?.staff?.map((s) => s.name) ?? []),
      ...(item.detailsJson?.characters?.flatMap((c) => [
        c.name,
        ...c.voiceActors.map((v) => v.name),
      ]) ?? []),
    ];
    const fields = {
      title: normalizeSearchText(item.title),
      altTitles: item.altTitles.map(normalizeSearchText),
      genres: item.genres.map(normalizeSearchText),
      studio: normalizeSearchText(item.studio ?? ""),
      people: normalizeSearchText(peopleNames.join(" ")),
    };
    const tokens =
      `${fields.title} ${fields.altTitles.join(" ")} ${fields.genres.join(" ")} ${fields.studio} ${fields.people}`.split(
        " "
      );
    for (const token of tokens) {
      if (!token) continue;
      for (let end = 1; end <= token.length; end++) {
        const prefix = token.slice(0, end);
        const bucket = byToken.get(prefix) ?? new Set<number>();
        bucket.add(index);
        byToken.set(prefix, bucket);
      }
    }
    return fields;
  });
  return { items, byToken, normalized };
}

export function searchCollectionIndex(
  index: CollectionSearchIndex,
  query: string
): CollectionItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return index.items;
  const candidates = new Set<number>();
  for (const token of normalizedQuery.split(" ")) {
    for (const itemIndex of index.byToken.get(token) ?? []) candidates.add(itemIndex);
  }
  return [...candidates]
    .map((itemIndex) => ({ item: index.items[itemIndex]!, fields: index.normalized[itemIndex]! }))
    .filter(({ fields }) =>
      [fields.title, ...fields.altTitles, ...fields.genres, fields.studio, fields.people].some(
        (field) => field.includes(normalizedQuery)
      )
    )
    .map(({ item }) => item);
}
