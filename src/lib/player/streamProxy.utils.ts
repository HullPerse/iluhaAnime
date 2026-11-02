import { readRememberedRoute } from "@/lib/player/streamRouteMemory.utils";

const KODIK_VARIANT_PREFIX = "Kodik:";

export function streamProxyArgs(proxy: string | null): Record<string, string> {
  const clean = proxy?.trim();
  if (!clean) return {};
  return { proxyUrl: clean, proxy_url: clean };
}

/**
 * The proxy to hand to mpv for a stream source.
 *
 * The AnimeLib proxy exists for the catalog (`anilist`/`animelib` hosts). Kodik
 * media does not need it: its geo check happens on the player API, which is
 * already resolved through the configured proxy, while the CDN serves the HLS
 * segments without a geo fence. Routing those segments through the same proxy
 * is what made a voice-over switch wait: one 2.8 MB Kodik segment took ~17 s at
 * ~170 KB/s through the proxy against ~0.8 s direct. A variant from any other
 * player keeps the proxy it always had.
 *
 * A route that already produced a frame for this player and host wins over the
 * default: a VPN that died yesterday should not be retried blindly today, and a
 * CDN that started blocking the direct route should keep its proxy.
 */
export function playbackProxyUrl(
  variantId: string,
  configured: string | null,
  mediaUrl?: string
): string | null {
  const proxy = configured?.trim() || null;
  const remembered = mediaUrl ? readRememberedRoute(variantId, mediaUrl) : null;
  if (remembered === "proxy") return proxy;
  if (remembered === "direct") return null;
  return variantId.startsWith(KODIK_VARIANT_PREFIX) ? null : proxy;
}
