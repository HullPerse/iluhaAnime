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
