import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";

/**
 * Small localStorage cache for the normalized word list the spell index is
 * built from. Restoring it skips the normalize pass over every anime title on
 * the next session; the delete map is still generated (it is far too large to
 * serialize). Keyed by the content fingerprint of the titles, so stale entries
 * can never be used for a different dictionary.
 */
const STORAGE_KEY = "iluha.v1.spellindex";
const MAX_ENTRIES = 2;
const MAX_WORDS = 60000;

interface SpellWordsEntry {
  fingerprint: string;
  words: string[];
}

interface SpellWordsEnvelope {
  f: 1;
  entries: SpellWordsEntry[];
}

function storageOf(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

function isEntry(value: unknown): value is SpellWordsEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as { fingerprint?: unknown; words?: unknown };
  return (
    typeof entry.fingerprint === "string" &&
    Array.isArray(entry.words) &&
    entry.words.every((word) => typeof word === "string")
  );
}

function parseEnvelope(raw: string | null): SpellWordsEnvelope | null {
  if (!raw) return null;
  const [parsed, error] = attemptSync(() => JSON.parse(raw) as unknown);
  if (error !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { f?: unknown; entries?: unknown };
  if (envelope.f !== 1 || !Array.isArray(envelope.entries)) return null;
  return { f: 1, entries: envelope.entries.filter(isEntry) };
}

export function readCachedSpellWords(fingerprint: string): string[] | null {
  const [storage] = attemptSync(storageOf);
  if (!storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem(STORAGE_KEY));
  if (readError !== null) return null;
  const envelope = parseEnvelope(raw);
  if (!envelope) return null;
  return envelope.entries.find((entry) => entry.fingerprint === fingerprint)?.words ?? null;
}

export function writeCachedSpellWords(fingerprint: string, words: readonly string[]): void {
  if (!fingerprint || words.length === 0 || words.length > MAX_WORDS) return;
  const [storage] = attemptSync(storageOf);
  if (!storage) return;
  const [raw] = attemptSync(() => storage.getItem(STORAGE_KEY));
  const previous = parseEnvelope(raw)?.entries ?? [];
  const envelope: SpellWordsEnvelope = {
    f: 1,
    entries: [
      { fingerprint, words: [...words] },
      ...previous.filter((entry) => entry.fingerprint !== fingerprint),
    ].slice(0, MAX_ENTRIES),
  };
  const [, writeError] = attemptSync(() => storage.setItem(STORAGE_KEY, JSON.stringify(envelope)));
  if (writeError !== null) reportBackgroundError("spell.index.cache", writeError);
}
