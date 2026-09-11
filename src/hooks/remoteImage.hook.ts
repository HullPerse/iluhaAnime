import { useEffect, useState } from "react";

import { createLruCache, inflightFetch } from "@/lib/utils/lruCache.utils";

import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types/image.userimage";

const resolvedUrls = createLruCache<string, string>(200);
const inflight = new Map<string, Promise<string | null>>();

export function resetRemoteImageCache(): void {
  resolvedUrls.clear();
  inflight.clear();
}

function fetchCachedImage(remoteUrl: string, proxyUrl: string): Promise<string | null> {
  const cached = resolvedUrls.get(remoteUrl);
  if (cached) return Promise.resolve(cached);
  return inflightFetch(inflight, remoteUrl, () =>
    invokeTyped<UserImageFile>("fetch_remote_image", {
      url: remoteUrl,
      proxyUrl,
    }).then(
      (image) => {
        const url = assetUrl(image.path);
        resolvedUrls.set(remoteUrl, url);
        return url;
      },
      () => null
    )
  );
}

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

export function useRemoteImage(remoteUrl: string | null | undefined): string | null {
  return useRemoteImageStatus(remoteUrl).src;
}
