import * as z from "zod/mini";

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
  data: z.record(z.string(), z.unknown()),
});

const CompiledEnvelope = z.compile(EnvelopeSchema);

function readEnvelope(raw: string, storeName: string): PersistedData | null {
  const parsed = parseJson(raw, CompiledEnvelope);
  if (!parsed.ok || parsed.value.store !== storeName) return null;
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
  let pending: T | undefined;
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fire = (): void => {
    timer = undefined;
    armed = false;
    if (pending === undefined) return;
    const next = pending;
    pending = undefined;
    task(next);
  };

  return {
    arm: (value) => {
      pending = value;
      if (armed) return;
      armed = true;
      timer = setTimeout(fire, delayMs);
    },
    flush: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      armed = false;
      if (pending === undefined) return;
      const next = pending;
      pending = undefined;
      task(next);
    },
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      armed = false;
      pending = undefined;
    },
  };
}
