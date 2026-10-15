import * as z from "zod/mini";

import { Debouncer } from "@/lib/pacer/debounce.utils";
import { attemptSync } from "@/lib/utils/attempt.utils";
import { parseJson } from "@/lib/utils/schema.utils";

export const PERSIST_FORMAT_VERSION = 1;

export function persistKey(storeName: string): string {
  return `iluha.v1.${storeName}`;
}

export interface PersistEnvelope {
  f: number;
  store: string;
  sv: number;
  ts: number;
  data: Record<string, unknown>;
}

export interface PersistedData {
  data: Record<string, unknown>;
  schemaVersion: number;
}

export interface PersistOptions {
  storeName: string;
  schemaVersion: number;
  getStorage: () => Storage | undefined;
  debounceMs?: number;
  fallback?: () => PersistedData | null;
  onError?: (scope: string, error: unknown) => void;
  now?: () => number;
}

export interface Persistor {
  write: (data: Record<string, unknown>) => void;
  flush: () => void;
  read: () => PersistedData | null;
  dispose: () => void;
}

const EnvelopeSchema = z.object({
  f: z.literal(PERSIST_FORMAT_VERSION),
  store: z.string(),
  sv: z.number(),
  ts: z.optional(z.number()),
  data: z.unknown(),
});

const CompiledEnvelope = z.compile(EnvelopeSchema);

function isDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readEnvelope(raw: string, storeName: string): PersistedData | null {
  const parsed = parseJson(raw, CompiledEnvelope);
  if (!parsed.ok || parsed.value.store !== storeName) return null;
  if (!isDataRecord(parsed.value.data)) return null;
  return { data: parsed.value.data, schemaVersion: parsed.value.sv };
}

export function createPersistor(options: PersistOptions): Persistor {
  const key = persistKey(options.storeName);
  const debounceMs = options.debounceMs ?? 250;
  const now = options.now ?? Date.now;

  const report = (scope: string, error: unknown): void => {
    options.onError?.(scope, error);
  };

  const persistNow = (data: Record<string, unknown>): void => {
    const envelope: PersistEnvelope = {
      f: PERSIST_FORMAT_VERSION,
      store: options.storeName,
      sv: options.schemaVersion,
      ts: now(),
      data,
    };
    const [storage, storageError] = attemptSync(() => options.getStorage());
    if (storageError !== null) {
      report("persist.storage", storageError);
      return;
    }
    if (!storage) return;
    const [, writeError] = attemptSync(() => storage.setItem(key, JSON.stringify(envelope)));
    if (writeError !== null) report("persist.write", writeError);
  };

  const writer = createTrailingScheduler<Record<string, unknown>>(
    (data) => persistNow(data),
    debounceMs
  );

  const flush = (): void => {
    writer.flush();
  };

  return {
    write: (data) => writer.arm(data),
    flush,
    read: () => {
      const [storage, storageError] = attemptSync(() => options.getStorage());
      if (storageError !== null) {
        report("persist.storage", storageError);
        return options.fallback?.() ?? null;
      }
      if (!storage) return options.fallback?.() ?? null;
      const [raw, readError] = attemptSync(() => storage.getItem(key));
      if (readError !== null) {
        report("persist.read", readError);
        return options.fallback?.() ?? null;
      }
      if (!raw) return options.fallback?.() ?? null;
      return readEnvelope(raw, options.storeName) ?? options.fallback?.() ?? null;
    },
    dispose: () => {
      writer.cancel();
    },
  };
}

interface TrailingScheduler<T> {
  arm: (value: T) => void;
  flush: () => void;
  cancel: () => void;
}

function createTrailingScheduler<T>(
  task: (value: T) => void,
  delayMs: number
): TrailingScheduler<T> {
  const pacer = new Debouncer((value: T) => task(value), { wait: delayMs });
  return {
    arm: (value) => pacer.maybeExecute(value),
    flush: () => pacer.flush(),
    cancel: () => pacer.cancel(),
  };
}
