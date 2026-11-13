import { useCallback, useEffect, useState } from "react";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";

import { systemApi } from "@/api/system.api";
import { attempt } from "@hullperse/hp_utils/attempt";
import { assetUrl, isDirectImageSrc } from "@/lib/graphics/image.utils";
import { invokeTyped } from "@/lib/core/system/invoke.utils";
import { createLruCache, inflightFetch } from "@hullperse/hp_utils/lruCache";
import { coverCorrectionsAtoms, setCoverBlob } from "@/store/cover.store";
import type { UserImageFile } from "@/types/core/userimage";

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
  const previousId = coverCorrectionsAtoms.blobs.get()[remoteUrl] ?? null;
  return inflightFetch(inflightCoverDownloads, remoteUrl, () =>
    invokeTyped<UserImageFile>("download_remote_image", {
      url: remoteUrl,
      nameHint: "collection-cover",
      proxyUrl,
      previousId,
    })
      .then((img) => {
        const url = assetUrl(img.path);
        coverCache.set(remoteUrl, { url, blobId: img.id });
        setCoverBlob(remoteUrl, img.id);
        return url;
      })
      .catch(() => null)
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
        downloadCover(remoteUrl, null)
          .then((downloaded) => {
            if (!cancelled && downloaded) setCoverUrl(downloaded);
            return null;
          })
          .catch((error: unknown) => reportBackgroundError("srchookscollectioncache", error));
        return;
      }
      resolveCachedImage(persistedId)
        .then((url) => {
          if (cancelled) return null;
          if (url) {
            coverCache.set(remoteUrl, { url, blobId: persistedId });
            setCoverUrl(url);
            return null;
          }
          return downloadCover(remoteUrl, null)
            .then((downloaded) => {
              if (!cancelled && downloaded) setCoverUrl(downloaded);
              return null;
            })
            .catch((error: unknown) => reportBackgroundError("srchookscollectioncache", error));
        })
        .catch((error: unknown) => reportBackgroundError("srchookscollectioncache", error));
    };
    if (blobId) {
      resolveCachedImage(blobId)
        .then((resolved) => {
          if (cancelled) return null;
          if (resolved) {
            setCoverUrl(resolved);
            return null;
          }
          return fromRemote();
        })
        .catch((error: unknown) => reportBackgroundError("srchookscollectioncache", error));
    } else {
      fromRemote();
    }
    return () => {
      cancelled = true;
    };
  }, [blobId, remoteUrl]);

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
        proxyUrl: null,
        previousId: coverCorrectionsAtoms.blobs.get()[remoteUrl] ?? null,
      })
    );
    if (error) return null;
    const url = assetUrl(img.path);
    coverCache.set(remoteUrl, { url, blobId: img.id });
    setCoverBlob(remoteUrl, img.id);
    setCoverUrl(url);
    return img.id;
  }, [remoteUrl]);

  return { cachedUrl: coverUrl, cache };
}
