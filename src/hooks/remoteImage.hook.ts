import { useEffect, useState } from "react";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";

import { isSourceImage } from "@/lib/graphics/images.utils";
import { assetUrl } from "@/lib/graphics/image.utils";
import { invokeTyped } from "@/lib/core/system/invoke.utils";
import { createLruCache } from "@hullperse/hp_utils/lruCache";
import { settingsAtoms } from "@/store/settings.store";
import type { UserImageFile } from "@/types/core/userimage";

type RemotePriority = "high" | "low";

interface RemoteTask {
  url: string;
  proxy: string | null;
  key: string;
  priority: RemotePriority;
  settle: (path: string | null) => void;
  cancel: () => void;
}

const REMOTE_IMAGE_CONCURRENCY = 4;
const PREFETCH_BATCH_SIZE = 8;

const resolvedUrls = createLruCache<string, string>(500);
const inflight = new Map<string, Promise<string | null>>();
const remoteTasks = new Map<string, RemoteTask>();
const highPriority: RemoteTask[] = [];
const lowPriority: RemoteTask[] = [];
let activeRemoteFetches = 0;
let remoteScope: Set<string> | null = null;

export const STREAM_COVER_REFERER = "https://animelib.org/";

const streamCovers = createLruCache<string, string>(300);
const streamInflight = new Map<string, Promise<string | null>>();

const STREAM_COVER_CONCURRENCY = 6;

interface FetchQueue {
  run: <T>(task: () => Promise<T>) => Promise<T>;
  reset: () => void;
}

function createFetchQueue(concurrency: number): FetchQueue {
  let active = 0;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    while (active < concurrency) {
      const task = queue.shift();
      if (!task) return;
      active += 1;
      task();
    }
  };

  return {
    run: <T>(task: () => Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        queue.push(() => {
          task()
            .then((value) => {
              active -= 1;
              pump();
              resolve(value);
              return null;
            })
            .catch((error: unknown) => {
              active -= 1;
              pump();
              reject(error instanceof Error ? error : new Error("Remote fetch failed"));
            });
        });
        pump();
      }),
    reset: () => {
      queue.length = 0;
      active = 0;
    },
  };
}

const streamCoverQueue = createFetchQueue(STREAM_COVER_CONCURRENCY);

function activeProxy(): string | null {
  const proxy = settingsAtoms.anilistProxyUrl.get();
  return proxy !== null && proxy.trim() !== "" ? proxy : null;
}

function remoteKey(url: string, proxy: string | null): string {
  return `${proxy ?? ""}\n${url}`;
}

function pumpRemoteQueue(): void {
  while (activeRemoteFetches < REMOTE_IMAGE_CONCURRENCY) {
    if (highPriority.length > 0) {
      activeRemoteFetches += 1;
      runSingleRemoteTask(highPriority.shift() as RemoteTask);
      continue;
    }
    const first = lowPriority[0];
    if (first === undefined) return;
    const batch: RemoteTask[] = [];
    while (
      batch.length < PREFETCH_BATCH_SIZE &&
      lowPriority.length > 0 &&
      (lowPriority[0] as RemoteTask).proxy === first.proxy
    ) {
      batch.push(lowPriority.shift() as RemoteTask);
    }
    activeRemoteFetches += 1;
    runRemoteBatch(batch);
  }
}

function runSingleRemoteTask(task: RemoteTask): void {
  invokeTyped<UserImageFile>("fetch_remote_image", {
    url: task.url,
    proxyUrl: task.proxy ?? undefined,
  })
    .then((image) => {
      task.settle(image ? assetUrl(image.path) : null);
      return null;
    })
    .catch(() => task.settle(null))
    .finally(() => {
      activeRemoteFetches -= 1;
      pumpRemoteQueue();
    })
    .catch(() => undefined);
}

function runRemoteBatch(tasks: RemoteTask[]): void {
  invokeTyped<Array<UserImageFile | null>>("fetch_remote_images", {
    urls: tasks.map((task) => task.url),
    proxyUrl: (tasks[0] as RemoteTask).proxy ?? undefined,
  })
    .then((images) => {
      const list = Array.isArray(images) ? images : [];
      tasks.forEach((task, index) => {
        const image = list[index] ?? null;
        task.settle(image ? assetUrl(image.path) : null);
      });
      return null;
    })
    .catch(() => {
      tasks.forEach((task) => task.settle(null));
    })
    .finally(() => {
      activeRemoteFetches -= 1;
      pumpRemoteQueue();
    })
    .catch(() => undefined);
}

function promoteRemoteTask(task: RemoteTask): void {
  const index = lowPriority.indexOf(task);
  if (index === -1) return;
  lowPriority.splice(index, 1);
  task.priority = "high";
  highPriority.push(task);
  pumpRemoteQueue();
}

function fetchCachedImage(
  remoteUrl: string,
  proxyUrl: string | null | undefined,
  priority: RemotePriority,
  deferPump = false
): Promise<string | null> {
  const cached = resolvedUrls.get(remoteUrl);
  if (cached) return Promise.resolve(cached);
  const proxy = proxyUrl === undefined ? activeProxy() : proxyUrl;
  const key = remoteKey(remoteUrl, proxy);
  const existing = inflight.get(key);
  if (existing) {
    const task = remoteTasks.get(key);
    if (priority === "high" && task?.priority === "low") promoteRemoteTask(task);
    return existing;
  }

  let resolveTask!: (value: string | null) => void;
  const promise = new Promise<string | null>((resolve) => {
    resolveTask = resolve;
  });
  let settled = false;
  const settle = (path: string | null): void => {
    if (settled) return;
    settled = true;
    if (inflight.get(key) === promise) inflight.delete(key);
    remoteTasks.delete(key);
    if (path !== null) resolvedUrls.set(remoteUrl, path);
    resolveTask(path);
  };
  const task: RemoteTask = {
    url: remoteUrl,
    proxy,
    key,
    priority,
    settle,
    cancel: () => settle(null),
  };
  remoteTasks.set(key, task);
  inflight.set(key, promise);
  if (priority === "high") highPriority.push(task);
  else lowPriority.push(task);
  if (!deferPump) pumpRemoteQueue();
  return promise;
}

export function resetRemoteImageCache(): void {
  cancelRemoteImageQueue();
  resolvedUrls.clear();
  inflight.clear();
  remoteTasks.clear();
  remoteScope = null;
  streamCovers.clear();
  streamInflight.clear();
  streamCoverQueue.reset();
}

/**
 * Drops queued fetches that no longer belong to the visible screen. Active
 * requests (at most four) finish and land in the cache, but stale queued work
 * no longer blocks the cards the user is looking at now.
 */
export function setRemoteImageScope(urls: Iterable<string> | null): void {
  remoteScope = urls === null ? null : new Set(urls);
  if (remoteScope === null) return;
  for (const queue of [highPriority, lowPriority]) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const task = queue[index] as RemoteTask;
      if (remoteScope.has(task.url)) continue;
      queue.splice(index, 1);
      task.cancel();
    }
  }
}

export function cancelRemoteImageQueue(): void {
  for (const queue of [highPriority, lowPriority]) {
    while (queue.length > 0) {
      (queue.pop() as RemoteTask).cancel();
    }
  }
}

/**
 * Downloads a remote image into the Rust cache and returns its full-size file
 * path, never the 336 px display thumbnail. Save and copy must export the
 * original bytes, so they ask the command for the export copy explicitly.
 */
export function fetchRemoteImageSource(remoteUrl: string): Promise<string | null> {
  const proxy = activeProxy();
  return invokeTyped<UserImageFile>("fetch_remote_image", {
    url: remoteUrl,
    full: true,
    proxyUrl: proxy ?? undefined,
  })
    .then((image) => image?.path ?? null)
    .catch(() => null);
}

function fetchStreamCover(remoteUrl: string): Promise<string | null> {
  const cached = streamCovers.get(remoteUrl);
  if (cached) return Promise.resolve(cached);
  const fromSource = isSourceImage(remoteUrl);
  const request = fromSource
    ? { url: remoteUrl, referer: STREAM_COVER_REFERER }
    : { url: remoteUrl, proxyUrl: settingsAtoms.anilistProxyUrl.get() ?? undefined };
  return streamInFlight(remoteUrl, () =>
    streamCoverQueue.run(() =>
      invokeTyped<UserImageFile>("fetch_remote_image", request)
        .then((image) => {
          if (!image) return null;
          const url = assetUrl(image.path);
          streamCovers.set(remoteUrl, url);
          return url;
        })
        .catch(() => null)
    )
  );
}

function streamInFlight(
  remoteUrl: string,
  task: () => Promise<string | null>
): Promise<string | null> {
  const existing = streamInflight.get(remoteUrl);
  if (existing) return existing;
  const promise = task().finally(() => {
    streamInflight.delete(remoteUrl);
  });
  streamInflight.set(remoteUrl, promise);
  return promise;
}

export function useStreamCover(remoteUrl: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() =>
    remoteUrl ? (streamCovers.get(remoteUrl) ?? null) : null
  );
  useEffect(() => {
    if (!remoteUrl) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    setSrc(streamCovers.get(remoteUrl) ?? null);
    fetchStreamCover(remoteUrl)
      .then((url) => {
        if (!cancelled) setSrc(url);
        return null;
      })
      .catch((error: unknown) => reportBackgroundError("srchooksremoteImage", error));
    return () => {
      cancelled = true;
    };
  }, [remoteUrl]);
  return src;
}

export function prefetchRemoteImages(
  urls: Array<string | null | undefined>,
  proxyUrl?: string | null
): Promise<void> {
  const proxy = proxyUrl === undefined ? activeProxy() : proxyUrl;
  const pending: Array<Promise<string | null>> = [];
  for (const raw of urls) {
    if (!raw) continue;
    if (resolvedUrls.has(raw)) continue;
    const key = remoteKey(raw, proxy);
    if (inflight.has(key)) continue;
    // Queue the whole burst before pumping so prefetch fills batches of eight
    // instead of starting one single-image batch per URL.
    pending.push(fetchCachedImage(raw, proxy, "low", true));
  }
  pumpRemoteQueue();
  return Promise.all(pending).then(() => undefined);
}

export function useRemoteImageStatus(remoteUrl: string | null | undefined): {
  src: string | null;
  failed: boolean;
} {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>(() => {
    if (!remoteUrl) return { src: null, failed: false };
    return { src: resolvedUrls.get(remoteUrl) ?? null, failed: false };
  });
  useEffect(() => {
    if (!remoteUrl) {
      setState({ src: null, failed: false });
      return;
    }
    let cancelled = false;
    setState({ src: resolvedUrls.get(remoteUrl) ?? null, failed: false });
    fetchCachedImage(remoteUrl, undefined, "high")
      .then((url) => {
        if (!cancelled) setState({ src: url, failed: url === null });
        return null;
      })
      .catch((error: unknown) => reportBackgroundError("srchooksremoteImage", error));
    return () => {
      cancelled = true;
    };
  }, [remoteUrl]);
  return state;
}

export function useRemoteImage(remoteUrl: string | null | undefined): string | null {
  return useRemoteImageStatus(remoteUrl).src;
}
