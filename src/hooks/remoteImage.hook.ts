import { useEffect, useState } from "react";

import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types";

const resolvedUrls = createLruCache<string, string>(200);
const inflight = new Map<string, Promise<string | null>>();

/** Called after the backend cache is wiped so stale disk paths stop resolving. */
export function resetRemoteImageCache(): void {
  resolvedUrls.clear();
  inflight.clear();
}

function fetchCachedImage(remoteUrl: string, proxyUrl: string): Promise<string | null> {
  const cached = resolvedUrls.get(remoteUrl);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(remoteUrl);
  if (pending) return pending;
  const request = invokeTyped<UserImageFile>("fetch_remote_image", {
    url: remoteUrl,
    proxyUrl,
  }).then(
    (image) => {
      const url = assetUrl(image.path);
      resolvedUrls.set(remoteUrl, url);
      return url;
    },
    () => null
  );
  request.finally(() => {
    inflight.delete(remoteUrl);
  });
  inflight.set(remoteUrl, request);
  return request;
}

/** Resolves a remote image through the backend disk cache when a TMDB proxy is set. */
export function useRemoteImageStatus(remoteUrl: string | null | undefined): {
  src: string | null;
  failed: boolean;
} {
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const [state, setState] = useState<{ src: string | null; failed: boolean }>(() => {
    if (!remoteUrl || !tmdbProxyUrl) return { src: remoteUrl ?? null, failed: false };
    return { src: resolvedUrls.get(remoteUrl) ?? null, failed: false };
  });
  useEffect(() => {
    if (!remoteUrl || !tmdbProxyUrl) {
      setState({ src: remoteUrl ?? null, failed: false });
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

/** Resolves a remote image through the backend disk cache when a TMDB proxy is set. */
export function useRemoteImage(remoteUrl: string | null | undefined): string | null {
  return useRemoteImageStatus(remoteUrl).src;
}
