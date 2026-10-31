import { useEffect, useState } from "react";
import { reportBackgroundError } from "@/lib/core/attempt.utils";

import { useCell } from "@/lib/core/signal.hook";
import { isSourceImage } from "@/lib/graphics/images.utils";
import { assetUrl } from "@/lib/graphics/image.utils";
import { invokeTyped } from "@/lib/core/invoke.utils";
import { createLruCache, inflightFetch } from "@/lib/core/lruCache.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { UserImageFile } from "@/types/core/userimage";

const resolvedUrls = createLruCache<string, string>(200);
const inflight = new Map<string, Promise<string | null>>();

/**
 * AnimeLib's cover CDN refuses requests that do not name the site as the
 * referer. The webview loads catalog covers through this cache so the Rust
 * side can send it.
 */
export const STREAM_COVER_REFERER = "https://animelib.org/";

const streamCovers = createLruCache<string, string>(300);
const streamInflight = new Map<string, Promise<string | null>>();

const REMOTE_IMAGE_CONCURRENCY = 2;
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

const remoteFetchQueue = createFetchQueue(REMOTE_IMAGE_CONCURRENCY);
const streamCoverQueue = createFetchQueue(STREAM_COVER_CONCURRENCY);

function enqueueRemoteFetch<T>(task: () => Promise<T>): Promise<T> {
  return remoteFetchQueue.run(task);
}

export function resetRemoteImageCache(): void {
  resolvedUrls.clear();
  inflight.clear();
  streamCovers.clear();
  streamInflight.clear();
  remoteFetchQueue.reset();
  streamCoverQueue.reset();
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

function fetchStreamCover(remoteUrl: string): Promise<string | null> {
  const cached = streamCovers.get(remoteUrl);
  if (cached) return Promise.resolve(cached);
  // Covers need the site's referer; AniList previews live on the streaming
  // services' CDNs, which reject a foreign referer and need the AniList proxy
  // in a blocked region. Rust writes either answer into the image cache, so a
  // preview is downloaded once and read from disk on the next launch.
  const fromSource = isSourceImage(remoteUrl);
  const request = fromSource
    ? { url: remoteUrl, referer: STREAM_COVER_REFERER }
    : { url: remoteUrl, proxyUrl: settingsAtoms.anilistProxyUrl.get() ?? undefined };
  return inflightFetch(streamInflight, remoteUrl, () =>
    streamCoverQueue.run(() =>
      invokeTyped<UserImageFile>("fetch_remote_image", request).then(
        (image) => {
          if (!image) return null;
          const url = assetUrl(image.path);
          streamCovers.set(remoteUrl, url);
          return url;
        },
        () => null
      )
    )
  );
}

/**
 * A catalog poster, downloaded once and served from the local asset cache.
 * `null` while the cover is still being fetched, so callers can show a
 * placeholder instead of a broken image.
 */
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
): void {
  const proxy = proxyUrl === undefined ? (settingsAtoms.tmdbProxyUrl.get() ?? null) : proxyUrl;
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
  const tmdbProxyUrl = useCell(settingsAtoms.tmdbProxyUrl);
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
    fetchCachedImage(remoteUrl, tmdbProxyUrl)
      .then((url) => {
        if (!cancelled) setState({ src: url, failed: url === null });
        return null;
      })
      .catch((error: unknown) => reportBackgroundError("srchooksremoteImage", error));
    return () => {
      cancelled = true;
    };
  }, [remoteUrl, tmdbProxyUrl]);
  return state;
}

export function useRemoteImage(remoteUrl: string | null | undefined): string | null {
  return useRemoteImageStatus(remoteUrl).src;
}
