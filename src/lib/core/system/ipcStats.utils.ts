import { attemptSync } from "@hullperse/hp_utils/attempt";

import type { TransportStats } from "@/types/core/transport";

interface IpcStatEntry {
  invokes: number;
  bodyBytes: number;
  responseBytes: number;
  totalMs: number;
  errors: number;
  dedupHits: number;
  cacheHits: number;
  durationsMs: number[];
}

const stats = new Map<string, IpcStatEntry>();

function entryFor(command: string): IpcStatEntry {
  const current = stats.get(command);

  if (current) return current;

  const entry: IpcStatEntry = {
    invokes: 0,
    bodyBytes: 0,
    responseBytes: 0,
    totalMs: 0,
    errors: 0,
    dedupHits: 0,
    cacheHits: 0,
    durationsMs: [],
  };
  stats.set(command, entry);

  return entry;
}

function now(): number {
  return performance.now();
}

export function getIpcStats(): TransportStats[] {
  return [...stats.entries()].map(([command, entry]) => ({
    command,
    ...entry,
    durationsMs: [...entry.durationsMs],
  }));
}

export function resetIpcStats(): void {
  stats.clear();
}

export function beginIpcInvoke(command: string, args?: Record<string, unknown>): number {
  if (!import.meta.env.DEV) return 0;

  const entry = entryFor(command);
  entry.invokes += 1;
  const [body] = attemptSync(() => JSON.stringify(args ?? null));
  entry.bodyBytes += body?.length ?? 0;

  return now();
}

export function finishIpcInvoke(
  command: string,
  startedAt: number,
  error: boolean,
  responseBytes: number
): void {
  if (!import.meta.env.DEV) return;

  const entry = entryFor(command);
  const durationMs = Math.max(0, now() - startedAt);

  entry.totalMs += durationMs;
  entry.durationsMs.push(durationMs);
  entry.responseBytes += responseBytes;

  if (error) entry.errors += 1;
}

export function recordIpcDedupHit(command: string): void {
  if (!import.meta.env.DEV) return;

  entryFor(command).dedupHits += 1;
}

export function recordIpcCacheHit(command: string): void {
  if (!import.meta.env.DEV) return;

  entryFor(command).cacheHits += 1;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__iluhaTransportStats = getIpcStats;
}
