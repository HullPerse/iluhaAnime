import { normalizeSearchText } from "@/lib/search/normalize.utils";
import {
  matchOperatorTerm,
  matchOperatorTerms,
  parseOperatorTerms,
  type OperatorTerm,
} from "@/lib/search/score.utils";
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

function fieldsOf(fields: {
  title: string;
  altTitles: string[];
  genres: string[];
  studio: string;
  people: string;
}): string[] {
  return [fields.title, ...fields.altTitles, ...fields.genres, fields.studio, fields.people].filter(
    (field) => field.length > 0
  );
}

function matchesNegatedOnly(fields: string[], terms: OperatorTerm[]): boolean {
  return !fields.some((field) =>
    terms.some((term) => matchOperatorTerm({ ...term, negate: false }, field) != null)
  );
}

export function searchCollectionIndex(
  index: CollectionSearchIndex,
  query: string
): CollectionItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return index.items;
  const terms = parseOperatorTerms(query);
  if (!terms) {
    const candidates = new Set<number>();
    for (const token of normalizedQuery.split(" ")) {
      for (const itemIndex of index.byToken.get(token) ?? []) candidates.add(itemIndex);
    }
    return filterByWholeQuery(index, candidates, normalizedQuery);
  }
  const positives = terms.filter((term) => !term.negate);
  const useBuckets = positives.length > 0 && positives.every((term) => term.mode === "prefix");
  const candidates = new Set<number>();
  if (!useBuckets) {
    for (let itemIndex = 0; itemIndex < index.items.length; itemIndex++) {
      candidates.add(itemIndex);
    }
  } else {
    for (const term of positives) {
      for (const itemIndex of index.byToken.get(term.text) ?? []) candidates.add(itemIndex);
    }
  }
  return [...candidates]
    .map((itemIndex) => ({ item: index.items[itemIndex]!, fields: index.normalized[itemIndex]! }))
    .filter(({ fields }) => {
      const all = fieldsOf(fields);
      if (positives.length === 0) return matchesNegatedOnly(all, terms);
      return all.some((field) => matchOperatorTerms(terms, field) != null);
    })
    .map(({ item }) => item);
}

function filterByWholeQuery(
  index: CollectionSearchIndex,
  candidates: Set<number>,
  normalizedQuery: string
): CollectionItem[] {
  return [...candidates]
    .map((itemIndex) => ({ item: index.items[itemIndex]!, fields: index.normalized[itemIndex]! }))
    .filter(({ fields }) => fieldsOf(fields).some((field) => field.includes(normalizedQuery)))
    .map(({ item }) => item);
}
