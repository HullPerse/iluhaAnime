import { useCallback, useEffect, useState } from "react";

import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";

export const COVER_CACHE_CAPACITY = 200;

const coverCache = createLruCache<string, { dataUrl: string; blobId: string }>(
  COVER_CACHE_CAPACITY
);
const imageDataCache = createLruCache<string, string>(COVER_CACHE_CAPACITY);

async function resolveCachedImage(blobId: string): Promise<string | null> {
  const cached = imageDataCache.get(blobId);
  if (cached) return cached;
  try {
    const image = await invokeTyped<{ dataUrl: string }>("get_user_image", {
      id: blobId,
    });
    imageDataCache.set(blobId, image.dataUrl);
    return image.dataUrl;
  } catch {
    return null;
  }
}

const inflightCoverDownloads = new Map<string, Promise<string | null>>();

function downloadCover(remoteUrl: string): Promise<string | null> {
  const cached = coverCache.get(remoteUrl);
  if (cached) return Promise.resolve(cached.dataUrl);
  const inflight = inflightCoverDownloads.get(remoteUrl);
  if (inflight) return inflight;
  const request = invokeTyped<{ id: string; dataUrl: string }>("download_remote_image", {
    url: remoteUrl,
    nameHint: "collection-cover",
  }).then(
    (img) => {
      coverCache.set(remoteUrl, { dataUrl: img.dataUrl, blobId: img.id });
      return img.dataUrl;
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
  const [dataUrl, setDataUrl] = useState<string | null>(
    (blobId && (imageDataCache.peek(blobId) ?? null)) ||
      (remoteUrl ? (coverCache.peek(remoteUrl)?.dataUrl ?? null) : null)
  );

  useEffect(() => {
    if (blobId) {
      let cancelled = false;
      resolveCachedImage(blobId).then((resolved) => {
        if (!cancelled && resolved) setDataUrl(resolved);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!remoteUrl) {
      setDataUrl(null);
      return;
    }
    const cached = coverCache.get(remoteUrl);
    if (cached) {
      setDataUrl(cached.dataUrl);
      return;
    }
    if (remoteUrl.startsWith("data:") || remoteUrl.startsWith("/")) {
      setDataUrl(remoteUrl);
      return;
    }
    let cancelled = false;
    downloadCover(remoteUrl).then((url) => {
      if (!cancelled && url) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [blobId, remoteUrl]);

  const cache = useCallback(async () => {
    if (!remoteUrl || remoteUrl.startsWith("data:") || remoteUrl.startsWith("/")) {
      return null;
    }
    const cached = coverCache.get(remoteUrl);
    if (cached) return cached.blobId;
    try {
      const img = await invokeTyped<{ id: string; dataUrl: string }>("download_remote_image", {
        url: remoteUrl,
        nameHint: "collection-cover",
      });
      coverCache.set(remoteUrl, { dataUrl: img.dataUrl, blobId: img.id });
      setDataUrl(img.dataUrl);
      return img.id;
    } catch {
      return null;
    }
  }, [remoteUrl]);

  return { cachedUrl: dataUrl, cache };
}
