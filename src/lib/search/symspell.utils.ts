import { normalizeSearchText } from "./normalize.utils";
import { isRomanNumeral } from "./roman.utils";

const MAX_EDIT_DISTANCE = 2;

function generateDeletes(word: string, maxDistance: number, deletes: Set<string>): void {
  if (maxDistance === 0) return;
  for (let i = 0; i < word.length; i++) {
    const del = word.slice(0, i) + word.slice(i + 1);
    if (!deletes.has(del)) {
      deletes.add(del);
      if (maxDistance > 1) generateDeletes(del, maxDistance - 1, deletes);
    }
  }
}

export class SymSpell {
  private deletesMap = new Map<string, Set<string>>();
  private words = new Set<string>();

  /** Adds a word that is already normalized (skips the normalize pass). */
  addNormalizedWord(word: string): void {
    if (!word || word.length < 3) return;
    if (this.words.has(word)) return;
    this.words.add(word);
    const deletes = new Set<string>();
    generateDeletes(word, MAX_EDIT_DISTANCE, deletes);
    for (const del of deletes) {
      const set = this.deletesMap.get(del) ?? new Set<string>();
      set.add(word);
      this.deletesMap.set(del, set);
    }
    const selfSet = this.deletesMap.get(word) ?? new Set<string>();
    selfSet.add(word);
    this.deletesMap.set(word, selfSet);
  }

  addWord(raw: string): void {
    this.addNormalizedWord(normalizeSearchText(raw).split(" ")[0] ?? "");
  }

  addWords(words: string[]): void {
    for (const w of words) {
      for (const part of normalizeSearchText(w).split(" ")) {
        if (part) this.addWord(part);
      }
    }
  }

  has(word: string): boolean {
    return this.words.has(word);
  }

  private collectCandidates(
    word: string,
    candidates: Map<string, number>,
    visited: Set<string>
  ): void {
    const queue: Array<{ text: string; dist: number }> = [{ text: word, dist: 0 }];
    visited.add(word);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      this.collectForCur(cur, candidates);
      if (cur.dist >= MAX_EDIT_DISTANCE) continue;
      this.expandDeletes(cur, queue, visited);
    }
  }

  private collectForCur(
    cur: { text: string; dist: number },
    candidates: Map<string, number>
  ): void {
    const found = this.deletesMap.get(cur.text);
    if (!found) return;
    for (const orig of found) {
      if (!candidates.has(orig)) candidates.set(orig, cur.dist);
    }
  }

  private expandDeletes(
    cur: { text: string; dist: number },
    queue: Array<{ text: string; dist: number }>,
    visited: Set<string>
  ): void {
    for (let i = 0; i < cur.text.length; i++) {
      const del = cur.text.slice(0, i) + cur.text.slice(i + 1);
      if (visited.has(del)) continue;
      visited.add(del);
      queue.push({ text: del, dist: cur.dist + 1 });
    }
  }

  private pickBest(candidates: Map<string, number>): string | null {
    return this.rankCandidates(candidates)[0] ?? null;
  }

  private rankCandidates(candidates: Map<string, number>): string[] {
    return [...candidates.entries()]
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .map(([word]) => word);
  }

  correctMany(input: string, limit = 3): string[] {
    const word = normalizeSearchText(input).split(" ")[0] ?? "";
    if (!word || this.words.has(word) || isRomanNumeral(word)) return [];
    const candidates = new Map<string, number>();
    const visited = new Set<string>();
    this.collectCandidates(word, candidates, visited);
    return this.rankCandidates(candidates).slice(0, Math.max(1, limit));
  }

  correct(input: string): string | null {
    const word = normalizeSearchText(input).split(" ")[0] ?? "";
    if (!word || this.words.has(word) || isRomanNumeral(word)) return null;
    const candidates = new Map<string, number>();
    const visited = new Set<string>();
    this.collectCandidates(word, candidates, visited);
    if (candidates.size === 0) return null;
    const best = this.pickBest(candidates);
    if (best === word) return null;
    return best;
  }

  suggest(query: string): string | null {
    return this.suggestMany(query, 1)[0] ?? null;
  }

  suggestMany(query: string, limit = 3): string[] {
    const cap = Math.max(1, limit);
    const parts = query.trim().split(/\s+/);
    const alternates = parts.map((part) => this.correctMany(part, cap));
    if (alternates.every((list) => list.length === 0)) return [];
    const normalizedQuery = normalizeSearchText(query);
    const best = parts.map((part, index) => alternates[index]?.[0] ?? part);
    const variants: string[][] = [best];
    for (let word = 0; word < parts.length && variants.length < cap; word++) {
      for (let rank = 1; rank < (alternates[word]?.length ?? 0); rank++) {
        if (variants.length >= cap) break;
        const next = [...best];
        next[word] = alternates[word]?.[rank] ?? next[word];
        variants.push(next);
      }
    }
    const seen = new Set<string>();
    return variants
      .map((words) => words.join(" "))
      .filter((correction) => {
        const key = normalizeSearchText(correction);
        if (!key || key === normalizedQuery || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, cap);
  }

  size(): number {
    return this.words.size;
  }
}

export function buildSymSpellFromTitles(titles: string[]): SymSpell {
  return buildSymSpellFromWords(normalizedSpellWords(titles));
}

/** Unique normalized words (length >= 3) the spell index is built from. */
export function normalizedSpellWords(titles: string[]): string[] {
  const words: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    for (const word of normalizeSearchText(title).split(" ")) {
      if (word.length < 3 || seen.has(word)) continue;
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}

export function buildSymSpellFromWords(words: readonly string[]): SymSpell {
  const s = new SymSpell();
  for (const word of words) s.addNormalizedWord(word);
  return s;
}
