import { attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";
import * as z from "zod/mini";

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

const SpellWordsEntrySchema = z.compile(
  z.object({ fingerprint: z.string(), words: z.array(z.string()) })
);
const SpellWordsEnvelopeSchema = z.compile(
  z.object({ f: z.literal(1), entries: z.array(z.unknown()) })
);

function storageOf(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

function isEntry(value: unknown): value is SpellWordsEntry {
  return SpellWordsEntrySchema.safeParse(value).success;
}

function parseEnvelope(raw: string | null): SpellWordsEnvelope | null {
  if (!raw) return null;
  const [parsed, error] = attemptSync((): unknown => JSON.parse(raw));
  if (error !== null) return null;
  const result = SpellWordsEnvelopeSchema.safeParse(parsed);
  if (!result.success) return null;
  return { f: 1, entries: result.data.entries.filter(isEntry) };
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
