import { attemptSync } from "@hullperse/hp_utils/attempt";
import { invokeCommand } from "@/lib/core/system/invoke.utils";
import { recordIpcDedupHit } from "@/lib/core/system/ipcStats.utils";
import { inflightFetch } from "@hullperse/hp_utils/lruCache";
import type { CommandName } from "@/types/core/ipc";
import type { ApiTransport } from "@/types/core/transport";

export {
  getIpcStats as getTransportStats,
  resetIpcStats as resetTransportStats,
} from "@/lib/core/system/ipcStats.utils";

const inflight = new Map<string, Promise<unknown>>();

const DEDUP_KEY_LIMIT = 4096;

function exceedsJsonBudget(value: unknown, limit: number): boolean {
  let size = 0;
  const visit = (item: unknown, depth: number): void => {
    if (size > limit) return;

    if (typeof item === "string") {
      size += item.length + 2;

      return;
    }

    if (item === null || typeof item !== "object") {
      size += 8;

      return;
    }

    if (depth >= 8) {
      size = limit + 1;

      return;
    }

    if (Array.isArray(item)) {
      size += item.length + 1;

      for (const child of item) {
        visit(child, depth + 1);

        if (size > limit) return;
      }

      return;
    }

    for (const [key, child] of Object.entries(item)) {
      size += key.length + 4;
      visit(child, depth + 1);

      if (size > limit) return;
    }

    size += 1;
  };

  visit(value, 0);

  return size > limit;
}

function dedupKey(command: string, args?: Record<string, unknown>): string | null {
  if (exceedsJsonBudget(args ?? null, DEDUP_KEY_LIMIT)) return null;
  const [raw] = attemptSync(() => JSON.stringify(args ?? null));

  if (raw === null || raw.length > DEDUP_KEY_LIMIT) return null;

  return `${command}:${raw}`;
}

export function resetTransportInflight(): void {
  inflight.clear();
}

export const tauriTransport: ApiTransport = {
  call: <T>(command: string, args?: Record<string, unknown>): Promise<Awaited<T>> => {
    const key = dedupKey(command, args);

    if (!key) return invokeCommand<T>(command as CommandName, args);

    if (inflight.has(key)) recordIpcDedupHit(command);

    return inflightFetch(inflight, key, () =>
      invokeCommand<T>(command as CommandName, args)
    ) as Promise<Awaited<T>>;
  },
};
