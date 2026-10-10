import { useCallback, useEffect, useState } from "react";

import { systemApi } from "@/api/system.api";
import { useCell } from "@/lib/state/signal.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { assetUrl, isDirectImageSrc } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createLruCache, inflightFetch } from "@/lib/utils/lruCache.utils";
import { coverCorrectionsAtoms, setCoverBlob } from "@/store/cover.store";
import { settingsAtoms } from "@/store/settings.store";
import type { UserImageFile } from "@/types/userimage";

export const COVER_CACHE_CAPACITY = 200;

const coverCache = createLruCache<string, { url: string; blobId: string }>(COVER_CACHE_CAPACITY);
const imageDataCache = createLruCache<string, string>(COVER_CACHE_CAPACITY);

async function resolveCachedImage(blobId: string): Promise<string | null> {
  const cached = imageDataCache.get(blobId);
  if (cached) return cached;
  const [image, error] = await attempt(systemApi.getUserImage(blobId));
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
        setCoverBlob(remoteUrl, img.id);
        return url;
      },
      () => null
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
  const tmdbProxyUrl = useCell(settingsAtoms.tmdbProxyUrl);

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
      const persistedId = coverCorrectionsAtoms.blobs.get()[remoteUrl];
      if (!persistedId) {
        downloadCover(remoteUrl, tmdbProxyUrl).then((downloaded) => {
          if (!cancelled && downloaded) setCoverUrl(downloaded);
        });
        return;
      }
      resolveCachedImage(persistedId).then((url) => {
        if (cancelled) return;
        if (url) {
          coverCache.set(remoteUrl, { url, blobId: persistedId });
          setCoverUrl(url);
          return;
        }
        downloadCover(remoteUrl, tmdbProxyUrl).then((downloaded) => {
          if (!cancelled && downloaded) setCoverUrl(downloaded);
        });
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
    const [img, error] = await attempt(
      invokeTyped<UserImageFile>("download_remote_image", {
        url: remoteUrl,
        nameHint: "collection-cover",
        proxyUrl: tmdbProxyUrl,
      })
    );
    if (error) return null;
    const url = assetUrl(img.path);
    coverCache.set(remoteUrl, { url, blobId: img.id });
    setCoverBlob(remoteUrl, img.id);
    setCoverUrl(url);
    return img.id;
  }, [remoteUrl, tmdbProxyUrl]);

  return { cachedUrl: coverUrl, cache };
}
