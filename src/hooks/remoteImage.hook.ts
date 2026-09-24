import { useEffect, useState } from "react";

import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createLruCache, inflightFetch } from "@/lib/utils/lruCache.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types/userimage";

const resolvedUrls = createLruCache<string, string>(200);
const inflight = new Map<string, Promise<string | null>>();

export const REMOTE_IMAGE_CONCURRENCY = 2;

let activeRemoteFetches = 0;
const remoteFetchQueue: Array<() => void> = [];

function pumpRemoteQueue(): void {
  while (activeRemoteFetches < REMOTE_IMAGE_CONCURRENCY) {
    const task = remoteFetchQueue.shift();
    if (!task) return;
    activeRemoteFetches += 1;
    task();
  }
}

function enqueueRemoteFetch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = (): void => {
      task()
        .then((value) => {
          activeRemoteFetches -= 1;
          pumpRemoteQueue();
          resolve(value);
        })
        .catch((error: unknown) => {
          activeRemoteFetches -= 1;
          pumpRemoteQueue();
          reject(error instanceof Error ? error : new Error("Remote fetch failed"));
        });
    };
    remoteFetchQueue.push(run);
    pumpRemoteQueue();
  });
}

export function resetRemoteImageCache(): void {
  resolvedUrls.clear();
  inflight.clear();
  remoteFetchQueue.length = 0;
  activeRemoteFetches = 0;
}

export function toSizedThumbUrl(url: string): string {
  if (url.includes("image.tmdb.org")) return url.replace(/\/w\d+\//u, "/w92/");
  return url;
}

function fetchCachedImage(remoteUrl: string, proxyUrl: string | null): Promise<string | null> {
  const cached = resolvedUrls.get(remoteUrl);
  if (cached) return Promise.resolve(cached);
  return inflightFetch(inflight, remoteUrl, () =>
    enqueueRemoteFetch(() =>
      invokeTyped<UserImageFile>("fetch_remote_image", {
        url: remoteUrl,
        proxyUrl,
      }).then(
        (image) => {
          if (!image) return null;
          const url = assetUrl(image.path);
          resolvedUrls.set(remoteUrl, url);
          return url;
        },
        () => null
      )
    )
  );
}

export function prefetchRemoteImages(
  urls: Array<string | null | undefined>,
  proxyUrl?: string | null
): void {
  const proxy =
    proxyUrl === undefined ? (useSettingsStore.getState().tmdbProxyUrl ?? null) : proxyUrl;
  for (const raw of urls) {
    if (!raw) continue;
    const url = toSizedThumbUrl(raw);
    if (resolvedUrls.has(url) || inflight.has(url)) continue;
    fetchCachedImage(url, proxy);
  }
}

export function useRemoteImageStatus(remoteUrl: string | null | undefined): {
  src: string | null;
  failed: boolean;
} {
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
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
    fetchCachedImage(remoteUrl, tmdbProxyUrl).then((url) => {
      if (!cancelled) setState({ src: url, failed: url === null });
    });
    return () => {
      cancelled = true;
    };
  }, [remoteUrl, tmdbProxyUrl]);
  return state;
}

export function useRemoteImage(remoteUrl: string | null | undefined): string | null {
  return useRemoteImageStatus(remoteUrl).src;
}
