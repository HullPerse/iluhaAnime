import { normalizeSearchText } from "./normalize.utils";
import { SymSpell } from "./symspell.utils";

/**
 * Spell index that collects its word set cheaply up front and defers the
 * expensive delete-map generation until it is pumped (idle slices) or first
 * needed. Queries always return full-quality results: a still-cold index is
 * finished synchronously on demand.
 */
export class LazySpellIndex {
  private readonly wordList: readonly string[];
  private readonly words: Set<string>;
  private sym: SymSpell | null = null;
  private cursor = 0;

  constructor(wordList: readonly string[]) {
    this.wordList = wordList;
    this.words = new Set(wordList);
  }

  get ready(): boolean {
    return this.cursor >= this.wordList.length;
  }

  get size(): number {
    return this.words.size;
  }

  normalizedWords(): readonly string[] {
    return this.wordList;
  }

  /** Advances delete generation by up to `budget` words; true once complete. */
  pump(budget: number): boolean {
    if (this.cursor >= this.wordList.length) return true;
    this.sym ??= new SymSpell();
    const end = Math.min(this.wordList.length, this.cursor + Math.max(1, budget));
    for (let index = this.cursor; index < end; index++) {
      this.sym.addNormalizedWord(this.wordList[index]!);
    }
    this.cursor = end;
    return this.cursor >= this.wordList.length;
  }

  private ensure(): SymSpell {
    this.pump(Number.MAX_SAFE_INTEGER);
    this.sym ??= new SymSpell();
    return this.sym;
  }

  suggestMany(query: string, limit = 3): string[] {
    if (!query.trim()) return [];
    const parts = query.trim().split(/\s+/);
    if (parts.every((part) => this.words.has(normalizeSearchText(part)))) return [];
    return this.ensure().suggestMany(query, limit);
  }

  suggest(query: string): string | null {
    return this.suggestMany(query, 1)[0] ?? null;
  }
}
