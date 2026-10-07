import { attemptSync } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { inflightFetch } from "@/lib/utils/lruCache.utils";
import type { CommandName } from "@/types/ipc";

export interface ApiTransport {
  call: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

const inflight = new Map<string, Promise<unknown>>();

const DEDUP_KEY_LIMIT = 4096;

export interface TransportStats {
  command: string;
  invokes: number;
  bodyBytes: number;
}

const stats = new Map<string, { invokes: number; bodyBytes: number }>();

export function getTransportStats(): TransportStats[] {
  return [...stats.entries()].map(([command, entry]) => ({ command, ...entry }));
}

export function resetTransportStats(): void {
  stats.clear();
}

function recordInvoke(command: string, args?: Record<string, unknown>): void {
  const entry = stats.get(command) ?? { invokes: 0, bodyBytes: 0 };
  entry.invokes += 1;
  const [body] = attemptSync(() => JSON.stringify(args ?? null));
  entry.bodyBytes += body?.length ?? 0;
  stats.set(command, entry);
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__iluhaTransportStats = getTransportStats;
}

function dedupKey(command: string, args?: Record<string, unknown>): string | null {
  const [raw] = attemptSync(() => JSON.stringify(args ?? null));
  if (raw === null || raw.length > DEDUP_KEY_LIMIT) return null;
  return `${command}:${raw}`;
}

export function resetTransportInflight(): void {
  inflight.clear();
}

export const tauriTransport: ApiTransport = {
  call: <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const key = dedupKey(command, args);
    if (!key) {
      recordInvoke(command, args);
      return invokeTyped<T>(command as CommandName, args);
    }
    return inflightFetch(inflight, key, () => {
      recordInvoke(command, args);
      return invokeTyped<T>(command as CommandName, args);
    }) as Promise<T>;
  },
};
