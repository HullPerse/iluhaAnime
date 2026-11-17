export type ProxyScheme = "socks5" | "socks5h" | "http" | "https";

const PROXY_SCHEME = /^(socks5h?|https?):\/\//u;

export function proxyScheme(value: string | null): ProxyScheme | null {
  if (value === null) return null;
  const match = PROXY_SCHEME.exec(value.trim());
  return (match?.[1] as ProxyScheme | undefined) ?? null;
}

export function isValidProxyUrlFor(
  value: string | null,
  schemes?: readonly ProxyScheme[]
): boolean {
  if (value === null || value.trim().length === 0) return true;
  const scheme = proxyScheme(value);
  if (scheme === null) return false;
  return schemes === undefined || schemes.includes(scheme);
}

export function isValidProxyUrl(value: string | null): boolean {
  return isValidProxyUrlFor(value);
}

/**
 * Per-feature proxies inherit the AniList proxy when the override is empty,
 * so existing setups keep routing card art and Daily through it.
 */
export function effectiveProxyUrl(
  override: string | null | undefined,
  fallback: string | null | undefined
): string | null {
  const primary = override?.trim() ?? "";
  if (primary !== "") return primary;
  const secondary = fallback?.trim() ?? "";
  return secondary !== "" ? secondary : null;
}

/** Sukebei shares Nyaa's host family, so an empty Sukebei proxy follows Nyaa. */
export function searchProxyUrl(
  proxies: Record<string, string>,
  source: string
): string | undefined {
  const direct = proxies[source]?.trim();
  if (direct) return direct;
  if (source !== "sukebei") return undefined;
  return proxies.nyaa?.trim() || undefined;
}
