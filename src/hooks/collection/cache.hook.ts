import { useCallback, useEffect, useState } from "react";

import { attempt } from "@/lib/utils/attempt.utils";
import { assetUrl, isDirectImageSrc } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createLruCache, inflightFetch } from "@/lib/utils/lruCache.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types/image.userimage";

export const COVER_CACHE_CAPACITY = 200;

const coverCache = createLruCache<string, { url: string; blobId: string }>(COVER_CACHE_CAPACITY);
const imageDataCache = createLruCache<string, string>(COVER_CACHE_CAPACITY);

async function resolveCachedImage(blobId: string): Promise<string | null> {
  const cached = imageDataCache.get(blobId);
  if (cached) return cached;
  const [image, error] = await attempt(
    invokeTyped<UserImageFile>("get_user_image", { id: blobId })
  );
  if (error) return null;
  const url = assetUrl(image.path);
  imageDataCache.set(blobId, url);
  return url;
}

const inflightCoverDownloads = new Map<string, Promise<string | null>>();

export function resetCoverCache(): void {
  coverCache.clear();
  imageDataCache.clear();
  inflightCoverDownloads.clear();
}

function downloadCover(remoteUrl: string, proxyUrl: string | null): Promise<string | null> {
  const cached = coverCache.get(remoteUrl);
  if (cached) return Promise.resolve(cached.url);
  return inflightFetch(inflightCoverDownloads, remoteUrl, () =>
    invokeTyped<UserImageFile>("download_remote_image", {
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
    )
  );
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
