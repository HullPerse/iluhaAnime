import { Debouncer } from "@/lib/pacer/debounce.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { isSameOrInside, normalizePath } from "@/lib/watcher/paths.watcher";
import type { VideoFileEntry } from "@/types/fs";

/**
 * Every watcher consumer needs its own view of the same changed folder: the
 * player route rebuilds the tree, the live playlist rebuilds its desired list.
 * Each of them used to walk the root on its own, so one event cost N walks.
 *
 * The bus collects those requests for one tick (pacer `Debouncer`, no manual
 * timers) and issues a single backend call:
 *
 * - roots asked for a full walk go to one `refresh_file_index` call;
 * - roots asked for a point update go to one `update_file_index_paths` call;
 * - a root asked for both in the same tick is walked once and the point update
 *   is skipped, so a walk and a point update never race on the same root.
 */

export interface FullScanRequest {
  /** Watched folder root that has to be walked. */
  root: string;
  extensions: string[];
  threads: number;
}

export interface PatchScanRequest extends FullScanRequest {
  /** Paths the watcher reported as created or modified: re-read them. */
  upserts: string[];
  /** Paths the watcher reported as removed: drop them. */
  removals: string[];
}

/**
 * `kind: "full"` means the root was walked after all (another consumer in the
 * same tick asked for it), so the caller rebuilds its tree from `entries`
 * instead of patching it node by node.
 */
export type PatchScanOutcome =
  | { kind: "full"; entries: VideoFileEntry[] }
  | { kind: "patch"; fresh: VideoFileEntry[]; removed: string[] };

export interface ScanExecutors {
  walk: (roots: string[], extensions: string[], threads: number) => Promise<VideoFileEntry[]>;
  patch: (
    upserts: string[],
    removals: string[],
    extensions: string[],
    threads: number
  ) => Promise<VideoFileEntry[]>;
}

export interface ScanBus {
  /** Resolves with the entries under the root, exactly like one direct scan. */
  fullScan: (request: FullScanRequest) => Promise<VideoFileEntry[]>;
  patchScan: (request: PatchScanRequest) => Promise<PatchScanOutcome>;
  /** Runs the pending tick immediately (tests). */
  flush: () => void;
  /** Drops the pending tick; its waiters reject with a cancellation error. */
  cancel: () => void;
}

export interface ScanBusOptions extends Partial<ScanExecutors> {
  /** Quiet window of a tick; requests inside it share one call. */
  waitMs?: number;
  /** Upper bound so a stream of requests cannot starve the first waiter. */
  maxWaitMs?: number;
}

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

/** The two backend calls the bus batches; injectable for tests. */
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
    try {
      const entries = await walk(
        batch.map((request) => request.root),
        settings ? settings.extensions : [],
        settings ? settings.threads : 0
      );
      for (const request of batch) {
        const forRoot = entries.filter((entry) => isSameOrInside(request.root, entry.path));
        for (const waiter of request.fullWaiters) waiter.resolve(forRoot);
        for (const waiter of request.patchWaiters)
          waiter.resolve({ kind: "full", entries: forRoot });
      }
    } catch (error) {
      for (const request of batch) {
        for (const waiter of request.fullWaiters) waiter.reject(error);
        for (const waiter of request.patchWaiters) waiter.reject(error);
      }
    }
  };

  const runPatch = async (batch: PendingRequest[]): Promise<void> => {
    const settings = batch[0];
    const upserts = [...new Set(batch.flatMap((request) => [...request.upserts]))];
    const removals = [...new Set(batch.flatMap((request) => [...request.removals]))];
    try {
      const fresh = await patch(
        upserts,
        removals,
        settings ? settings.extensions : [],
        settings ? settings.threads : 0
      );
      for (const request of batch) {
        const forRoot = fresh.filter((entry) => isSameOrInside(request.root, entry.path));
        const removed = [...request.removals];
        for (const waiter of request.patchWaiters)
          waiter.resolve({ kind: "patch", fresh: forRoot, removed });
      }
    } catch (error) {
      for (const request of batch) {
        for (const waiter of request.patchWaiters) waiter.reject(error);
      }
    }
  };

  const tick = (): void => {
    const batch = [...pending.values()];
    pending.clear();
    if (batch.length === 0) return;
    const walks = batch.filter((request) => request.full);
    const updates = batch.filter((request) => !request.full);
    // Disjoint root sets, disjoint calls; each one reports to its own waiters,
    // so neither failure escapes as an unhandled rejection of the tick.
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
      // Extensions and thread count are global settings: the newest request in
      // the tick wins for the whole batch.
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

/** Process-wide bus: the player route and the live playlist must share it. */
export function folderScanBus(): ScanBus {
  shared ??= createScanBus();
  return shared;
}
