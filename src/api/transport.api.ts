import { invokeTyped } from "@/lib/utils/invoke.utils";
import { inflightFetch } from "@/lib/utils/lruCache.utils";
import type { CommandName } from "@/types/ipc";

export interface ApiTransport {
  call: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

const inflight = new Map<string, Promise<unknown>>();

const DEDUP_KEY_LIMIT = 4096;

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
    if (!key) return invokeTyped<T>(command as CommandName, args);
    return inflightFetch(inflight, key, () =>
      invokeTyped<T>(command as CommandName, args)
    ) as Promise<T>;
  },
};
