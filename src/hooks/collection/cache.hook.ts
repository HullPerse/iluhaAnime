import { useCallback, useEffect, useState } from "react";

import { assetUrl, isDirectImageSrc } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types";

export const COVER_CACHE_CAPACITY = 200;

const coverCache = createLruCache<string, { url: string; blobId: string }>(COVER_CACHE_CAPACITY);
const imageDataCache = createLruCache<string, string>(COVER_CACHE_CAPACITY);

async function resolveCachedImage(blobId: string): Promise<string | null> {
  const cached = imageDataCache.get(blobId);
  if (cached) return cached;
  try {
    const image = await invokeTyped<UserImageFile>("get_user_image", {
      id: blobId,
    });
    const url = assetUrl(image.path);
    imageDataCache.set(blobId, url);
    return url;
  } catch {
    return null;
  }
}

const inflightCoverDownloads = new Map<string, Promise<string | null>>();

/** Called after the backend cache is wiped so stale disk paths stop resolving. */
export function resetCoverCache(): void {
  coverCache.clear();
  imageDataCache.clear();
  inflightCoverDownloads.clear();
}

function downloadCover(remoteUrl: string, proxyUrl: string | null): Promise<string | null> {
  const cached = coverCache.get(remoteUrl);
  if (cached) return Promise.resolve(cached.url);
  const inflight = inflightCoverDownloads.get(remoteUrl);
  if (inflight) return inflight;
  // proxyUrl is required for tmdb images: without it the WebView loads image.tmdb.org
  // directly, which refuses cross-origin/desktop requests and the cover disappears.
  const request = invokeTyped<UserImageFile>("download_remote_image", {
    url: remoteUrl,
    nameHint: "collection-cover",
    proxyUrl,
  }).then(
    (img) => {
      const url = assetUrl(img.path);
      coverCache.set(remoteUrl, { url, blobId: img.id });
      return url;
    },
    () => remoteUrl
  );
  request.finally(() => {
    if (inflightCoverDownloads.get(remoteUrl) === request) {
      inflightCoverDownloads.delete(remoteUrl);
    }
  });
  inflightCoverDownloads.set(remoteUrl, request);
  return request;
}

export function useCoverCache(
  remoteUrl: string | null | undefined,
  blobId?: string | null
): {
  cachedUrl: string | null;
  cache: () => Promise<string | null>;
} {
  const [coverUrl, setCoverUrl] = useState<string | null>(
    (blobId && (imageDataCache.peek(blobId) ?? null)) ||
      (remoteUrl ? (coverCache.peek(remoteUrl)?.url ?? null) : null)
  );
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);

  useEffect(() => {
    let cancelled = false;
    const fromRemote = () => {
      if (!remoteUrl) {
        setCoverUrl(null);
        return;
      }
      const cached = coverCache.get(remoteUrl);
      if (cached) {
        setCoverUrl(cached.url);
        return;
      }
      if (isDirectImageSrc(remoteUrl)) {
        setCoverUrl(remoteUrl);
        return;
      }
      downloadCover(remoteUrl, tmdbProxyUrl).then((url) => {
        if (!cancelled && url) setCoverUrl(url);
      });
    };
    if (blobId) {
      resolveCachedImage(blobId).then((resolved) => {
        if (cancelled) return;
        if (resolved) {
          setCoverUrl(resolved);
          return;
        }
        // Stored file gone (wiped or moved): fall back to the remote cover and re-cache it.
        fromRemote();
      });
    } else {
      fromRemote();
    }
    return () => {
      cancelled = true;
    };
  }, [blobId, remoteUrl, tmdbProxyUrl]);

  const cache = useCallback(async () => {
    if (!remoteUrl || isDirectImageSrc(remoteUrl)) {
      return null;
    }
    const cached = coverCache.get(remoteUrl);
    if (cached) return cached.blobId;
    try {
      const img = await invokeTyped<UserImageFile>("download_remote_image", {
        url: remoteUrl,
        nameHint: "collection-cover",
        proxyUrl: tmdbProxyUrl,
      });
      const url = assetUrl(img.path);
      coverCache.set(remoteUrl, { url, blobId: img.id });
      setCoverUrl(url);
      return img.id;
    } catch {
      return null;
    }
  }, [remoteUrl, tmdbProxyUrl]);

  return { cachedUrl: coverUrl, cache };
}
