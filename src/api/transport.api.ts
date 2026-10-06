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
  try {
    entry.bodyBytes += JSON.stringify(args ?? null).length;
  } catch {
    entry.bodyBytes += 0;
  }
  stats.set(command, entry);
}

export function logTransportStats(): void {
  if (!import.meta.env.DEV) return;
  const rows = getTransportStats();
  const total = rows.reduce((sum, row) => sum + row.invokes, 0);
  console.warn(`[transport] ${total} invokes`, rows);
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__iluhaTransportStats = getTransportStats;
}

function dedupKey(command: string, args?: Record<string, unknown>): string | null {
  try {
    const raw = JSON.stringify(args ?? null);
    if (raw.length > DEDUP_KEY_LIMIT) return null;
    return `${command}:${raw}`;
  } catch {
    return null;
  }
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
