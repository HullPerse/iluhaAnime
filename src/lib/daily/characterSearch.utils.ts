import { normalizeSearchText } from "@hullperse/hp_utils/normalize";

import type { CharacterIndexEntry } from "@/types/api/characters";

export interface CharacterGuessChoice {
  id: number;
  name: string;
  alias: string | null;
}

const SUGGESTION_LIMIT = 6;

function textScore(text: string, needle: string): number {
  if (text === needle) return 100;

  if (text.startsWith(needle)) return 80;
  const words = text.split(" ");

  if (words.some((word) => word.startsWith(needle))) return 65;

  if (text.includes(needle)) return 50;
  const queryWords = needle.split(" ").filter(Boolean);

  if (queryWords.length > 1 && queryWords.every((word) => text.includes(word))) return 40;

  return 0;
}

function describeEntry(
  entry: CharacterIndexEntry,
  needle: string
): { score: number; alias: string | null } {
  const name = normalizeSearchText(entry.name);
  let score = textScore(name, needle);
  let alias: string | null = null;

  for (const value of entry.aliases) {
    const normalized = normalizeSearchText(value);

    if (normalized.length === 0 || normalized === name) continue;
    const aliasScore = textScore(normalized, needle) * 0.9;

    if (aliasScore > score) {
      score = aliasScore;
      alias = value;
    }
  }

  return { score, alias };
}

/** Canonical names whose title or alias matches the typed query. */
export function characterGuessChoices(
  entries: readonly CharacterIndexEntry[],
  query: string
): CharacterGuessChoice[] {
  const needle = normalizeSearchText(query.trim());

  if (needle.length < 2) return [];

  return entries
    .map((entry) => ({ entry, ...describeEntry(entry, needle) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name)
    )
    .slice(0, SUGGESTION_LIMIT)
    .map(({ entry, alias }) => ({ id: entry.id, name: entry.name, alias }));
}
