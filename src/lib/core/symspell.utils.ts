import { keyboardWordDistance } from "@/lib/search/searchKeyboard.utils";
import { normalizeSearchText } from "@/lib/core/normalize.utils";
import { isRomanNumeral } from "@/lib/core/roman.utils";

const MAX_EDIT_DISTANCE = 2;

export function maxEditDistanceFor(word: string): number {
  if (word.length < 3) return 0;
  if (word.length <= 4) return 1;
  return MAX_EDIT_DISTANCE;
}

export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const alphabet = new Map<string, number>();
  const sizeA = a.length;
  const sizeB = b.length;
  const dist: number[][] = Array.from({ length: sizeA + 2 }, (_, i) =>
    Array.from({ length: sizeB + 2 }, (_, j) => {
      if (i === 0) return j - 1;
      if (j === 0) return i - 1;
      return 0;
    })
  );
  let maxDist = sizeA + sizeB;
  for (let i = 1; i <= sizeA; i++) {
    let db = 0;
    for (let j = 1; j <= sizeB; j++) {
      const i1 = alphabet.get(b[j - 1] ?? "") ?? 0;
      const j1 = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        db = j;
      }
      const substitution = (dist[i][j] ?? 0) + cost;
      const insertion = (dist[i + 1][j] ?? 0) + 1;
      const deletion = (dist[i][j + 1] ?? 0) + 1;
      const transposition = (dist[i1][j1] ?? maxDist) + (i - i1 - 1) + 1 + (j - j1 - 1);
      dist[i + 1][j + 1] = Math.min(substitution, insertion, deletion, transposition);
    }
    alphabet.set(a[i - 1] ?? "", i);
    maxDist = dist[sizeA + 1][sizeB + 1] ?? maxDist;
  }
  return dist[sizeA + 1][sizeB + 1] ?? Math.max(sizeA, sizeB);
}

const NUMERIC_RE = /^\d+$/;

const STOPWORDS = new Set([
  "no",
  "wa",
  "ga",
  "ni",
  "to",
  "de",
  "e",
  "o",
  "na",
  "ha",
  "wo",
  "mo",
  "ka",
  "ya",
  "ne",
  "yo",
  "x",
  "the",
  "of",
  "on",
  "and",
  "or",
  "a",
  "an",
  "vs",
]);

function isKnownPiece(piece: string, words: Set<string>): boolean {
  return words.has(piece) || STOPWORDS.has(piece);
}

export function isKnownGlueWord(word: string): boolean {
  return STOPWORDS.has(word);
}

function isCorrectableToken(word: string, words: Set<string>): boolean {
  return word.length >= 3 && !words.has(word) && !isRomanNumeral(word);
}

export function segmentToken(token: string, words: Set<string>): string[] | null {
  const word = normalizeSearchText(token).split(" ")[0] ?? "";
  if (!word || words.has(word) || word.length < 6) return null;
  const maxPiece = Math.min(15, word.length);
  const best: Array<string[] | null> = Array.from({ length: word.length + 1 }, () => null);
  best[0] = [];
  for (let end = 1; end <= word.length; end++) {
    for (let start = Math.max(0, end - maxPiece); start < end; start++) {
      const prefix = best[start];
      if (!prefix) continue;
      const piece = word.slice(start, end);
      if (piece.length < 2 && !STOPWORDS.has(piece)) continue;
      if (!isKnownPiece(piece, words)) continue;
      const candidate = [...prefix, piece];
      if (!best[end] || candidate.length < (best[end]?.length ?? 0)) best[end] = candidate;
    }
  }
  const full = best[word.length];
  if (!full || full.length < 2) return null;
  return full;
}

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
    visited: Set<string>,
    budget: number
  ): void {
    const queue: Array<{ text: string; dist: number }> = [{ text: word, dist: 0 }];
    visited.add(word);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      this.collectForCur(cur, candidates);
      if (cur.dist >= budget) continue;
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

  private pickBest(query: string, candidates: Map<string, number>): string | null {
    return this.rankCandidates(query, candidates)[0] ?? null;
  }

  private rankCandidates(query: string, candidates: Map<string, number>): string[] {
    return [...candidates.entries()]
      .sort(
        (left, right) =>
          left[1] - right[1] ||
          damerauLevenshtein(query, left[0]) - damerauLevenshtein(query, right[0]) ||
          keyboardWordDistance(query, left[0]) - keyboardWordDistance(query, right[0]) ||
          left[0].localeCompare(right[0])
      )
      .map(([word]) => word);
  }

  correctMany(input: string, limit = 3): string[] {
    const word = normalizeSearchText(input).split(" ")[0] ?? "";
    if (!word || this.words.has(word) || isRomanNumeral(word)) return [];
    if (maxEditDistanceFor(word) === 0) return [];
    const candidates = new Map<string, number>();
    const visited = new Set<string>();
    this.collectCandidates(word, candidates, visited, maxEditDistanceFor(word));
    return this.rankCandidates(word, candidates).slice(0, Math.max(1, limit));
  }

  correct(input: string): string | null {
    const word = normalizeSearchText(input).split(" ")[0] ?? "";
    if (!word || this.words.has(word) || isRomanNumeral(word)) return null;
    if (maxEditDistanceFor(word) === 0) return null;
    const candidates = new Map<string, number>();
    const visited = new Set<string>();
    this.collectCandidates(word, candidates, visited, maxEditDistanceFor(word));
    if (candidates.size === 0) return null;
    const best = this.pickBest(word, candidates);
    if (best === word) return null;
    return best;
  }

  suggest(query: string): string | null {
    return this.suggestMany(query, 1)[0] ?? null;
  }

  private correctedToken(part: string): string {
    return this.correctMany(part, 1)[0] ?? part;
  }

  private joinShapes(parts: string[]): string[][] {
    const shapes: string[][] = [];
    for (let index = 0; index < parts.length - 1; index++) {
      const left = parts[index] ?? "";
      const right = parts[index + 1] ?? "";
      if (NUMERIC_RE.test(left) || NUMERIC_RE.test(right)) continue;
      const leftKnown = !isCorrectableToken(left, this.words);
      const rightKnown = !isCorrectableToken(right, this.words);
      if (leftKnown && rightKnown) continue;
      const joined = `${left}${right}`;
      if (!this.words.has(joined) && this.correctMany(joined, 1).length === 0) continue;
      shapes.push([...parts.slice(0, index), joined, ...parts.slice(index + 2)]);
    }
    return shapes;
  }

  private splitShapes(parts: string[]): string[][] {
    const shapes: string[][] = [];
    for (let index = 0; index < parts.length; index++) {
      const pieces = segmentToken(parts[index] ?? "", this.words);
      if (!pieces) continue;
      shapes.push([...parts.slice(0, index), ...pieces, ...parts.slice(index + 1)]);
    }
    return shapes;
  }

  suggestMany(query: string, limit = 3): string[] {
    const cap = Math.max(1, limit);
    const parts = query
      .trim()
      .split(/\s+/)
      .flatMap((part) => normalizeSearchText(part).split(" "))
      .filter((word) => word.length > 0);
    const shapes = [parts, ...this.joinShapes(parts), ...this.splitShapes(parts)];
    const variants: string[][] = [];
    for (const shape of shapes) {
      variants.push(shape.map((part) => this.correctedToken(part)));
    }
    if (variants.length > 0) {
      const first = shapes[0] ?? [];
      const corrected = variants[0] ?? [];
      const alternates = first.map((part) => this.correctMany(part, cap));
      for (let word = 0; word < first.length && variants.length < cap + 4; word++) {
        for (let rank = 1; rank < (alternates[word]?.length ?? 0); rank++) {
          const next = [...corrected];
          next[word] = alternates[word]?.[rank] ?? next[word];
          variants.push(next);
        }
      }
    }
    if (
      variants.every(
        (words) =>
          words.length === parts.length && words.every((word, index) => word === parts[index])
      )
    )
      return [];
    const normalizedQuery = normalizeSearchText(query);
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
