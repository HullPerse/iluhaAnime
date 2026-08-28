import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

// Cache remote cover URLs to user_assets blobs. Returns { cachedUrl, cache } where
// cachedUrl is a data: URL if cached, or the original remote URL.
const coverCache = new Map<string, { dataUrl: string; blobId: string }>();
const imageDataCache = new Map<string, string>();

async function resolveCachedImage(blobId: string): Promise<string | null> {
  const cached = imageDataCache.get(blobId);
  if (cached) return cached;
  try {
    const image = await invoke<{ dataUrl: string }>("get_user_image", {
      id: blobId,
    });
    imageDataCache.set(blobId, image.dataUrl);
    return image.dataUrl;
  } catch {
    return null;
  }
}

export function useCoverCache(
  remoteUrl: string | null | undefined,
  blobId?: string | null
): {
  cachedUrl: string | null;
  cache: () => Promise<string | null>;
} {
  const [dataUrl, setDataUrl] = useState<string | null>(
    (blobId && imageDataCache.get(blobId)) ||
      (remoteUrl ? (coverCache.get(remoteUrl)?.dataUrl ?? null) : null)
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
    invoke<{ id: string; dataUrl: string }>("download_remote_image", {
      url: remoteUrl,
      nameHint: "collection-cover",
    })
      .then((img) => {
        if (cancelled) return;
        coverCache.set(remoteUrl, { dataUrl: img.dataUrl, blobId: img.id });
        setDataUrl(img.dataUrl);
      })
      .catch(() => {
        // Offline or failed: fall back to remote URL (will fail to load, placeholder shown).
        if (!cancelled) setDataUrl(remoteUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [blobId, remoteUrl]);

  const cache = useCallback(async () => {
    if (
      !remoteUrl ||
      remoteUrl.startsWith("data:") ||
      remoteUrl.startsWith("/")
    ) {
      return null;
    }
    const cached = coverCache.get(remoteUrl);
    if (cached) return cached.blobId;
    try {
      const img = await invoke<{ id: string; dataUrl: string }>(
        "download_remote_image",
        { url: remoteUrl, nameHint: "collection-cover" }
      );
      coverCache.set(remoteUrl, { dataUrl: img.dataUrl, blobId: img.id });
      setDataUrl(img.dataUrl);
      return img.id;
    } catch {
      return null;
    }
  }, [remoteUrl]);

  return { cachedUrl: dataUrl, cache };
}