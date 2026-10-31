import { attempt } from "@/lib/core/attempt.utils";
import { Debouncer } from "@/lib/core/debounce.utils";
import { invokeTyped } from "@/lib/core/invoke.utils";
import { isSameOrInside, normalizePath } from "@/lib/core/pathsWatcher.utils";
import type { VideoFileEntry } from "@/types/core/fs";
import type {
  FullScanRequest,
  PatchScanOutcome,
  PatchScanRequest,
  ScanBus,
  ScanBusOptions,
  ScanExecutors,
} from "@/types/core/scanBus";

const DEFAULT_WAIT_MS = 50;
const DEFAULT_MAX_WAIT_MS = 500;

interface Waiter<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface PendingRequest {
  root: string;
  extensions: string[];
  threads: number;
  full: boolean;
  upserts: Set<string>;
  removals: Set<string>;
  fullWaiters: Waiter<VideoFileEntry[]>[];
  patchWaiters: Waiter<PatchScanOutcome>[];
}

export const scanExecutors: ScanExecutors = {
  walk: (roots, extensions, threads) =>
    invokeTyped<VideoFileEntry[]>("refresh_file_index", {
      paths: roots,
      extensions,
      threads,
    }),
  patch: (upserts, removals, extensions, threads) =>
    invokeTyped<VideoFileEntry[]>("update_file_index_paths", {
      upserts,
      removals,
      extensions,
      threads,
    }),
};

export function createScanBus(options: ScanBusOptions = {}): ScanBus {
  const walk = options.walk ?? scanExecutors.walk;
  const patch = options.patch ?? scanExecutors.patch;
  const pending = new Map<string, PendingRequest>();

  const runWalk = async (batch: PendingRequest[]): Promise<void> => {
    const settings = batch[0];
    const [entries, error] = await attempt(
      walk(
        batch.map((request) => request.root),
        settings ? settings.extensions : [],
        settings ? settings.threads : 0
      )
    );
    if (error !== null) {
      for (const request of batch) {
        for (const waiter of request.fullWaiters) waiter.reject(error);
        for (const waiter of request.patchWaiters) waiter.reject(error);
      }
      return;
    }
    for (const request of batch) {
      const forRoot = entries.filter((entry) => isSameOrInside(request.root, entry.path));
      for (const waiter of request.fullWaiters) waiter.resolve(forRoot);
      for (const waiter of request.patchWaiters) waiter.resolve({ kind: "full", entries: forRoot });
    }
  };

  const runPatch = async (batch: PendingRequest[]): Promise<void> => {
    const settings = batch[0];
    const upserts = [...new Set(batch.flatMap((request) => [...request.upserts]))];
    const removals = [...new Set(batch.flatMap((request) => [...request.removals]))];
    const [fresh, error] = await attempt(
      patch(upserts, removals, settings ? settings.extensions : [], settings ? settings.threads : 0)
    );
    if (error !== null) {
      for (const request of batch) {
        for (const waiter of request.patchWaiters) waiter.reject(error);
      }
      return;
    }
    for (const request of batch) {
      const forRoot = fresh.filter((entry) => isSameOrInside(request.root, entry.path));
      const removed = [...request.removals];
      for (const waiter of request.patchWaiters)
        waiter.resolve({ kind: "patch", fresh: forRoot, removed });
    }
  };

  const tick = (): void => {
    const batch = [...pending.values()];
    pending.clear();
    if (batch.length === 0) return;
    const walks = batch.filter((request) => request.full);
    const updates = batch.filter((request) => !request.full);
    (async () => {
      await Promise.all([
        walks.length > 0 ? runWalk(walks) : Promise.resolve(),
        updates.length > 0 ? runPatch(updates) : Promise.resolve(),
      ]);
    })();
  };

  const debouncer = new Debouncer(tick, {
    wait: options.waitMs ?? DEFAULT_WAIT_MS,
    maxWait: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
    leading: false,
    trailing: true,
  });

  const enqueue = <T>(
    request: FullScanRequest & Partial<Pick<PatchScanRequest, "upserts" | "removals">>,
    full: boolean,
    pick: (entry: PendingRequest) => Waiter<T>[]
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const key = normalizePath(request.root);
      let entry = pending.get(key);
      if (!entry) {
        entry = {
          root: request.root,
          extensions: request.extensions,
          threads: request.threads,
          full: false,
          upserts: new Set(),
          removals: new Set(),
          fullWaiters: [],
          patchWaiters: [],
        };
        pending.set(key, entry);
      }
      entry.extensions = request.extensions;
      entry.threads = request.threads;
      if (full) entry.full = true;
      for (const path of request.upserts ?? []) entry.upserts.add(path);
      for (const path of request.removals ?? []) entry.removals.add(path);
      pick(entry).push({ resolve, reject });
      debouncer.maybeExecute();
    });

  return {
    fullScan: (request) => enqueue<VideoFileEntry[]>(request, true, (entry) => entry.fullWaiters),
    patchScan: (request) =>
      enqueue<PatchScanOutcome>(request, false, (entry) => entry.patchWaiters),
    flush: () => debouncer.flush(),
    cancel: () => {
      debouncer.cancel();
      const batch = [...pending.values()];
      pending.clear();
      for (const request of batch) {
        const error = new Error("folder scan batch cancelled");
        for (const waiter of [...request.fullWaiters, ...request.patchWaiters])
          waiter.reject(error);
      }
    },
  };
}

let shared: ScanBus | null = null;

export function folderScanBus(): ScanBus {
  shared ??= createScanBus();
  return shared;
}
