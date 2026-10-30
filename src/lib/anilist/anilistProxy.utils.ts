export function anilistProxyArgs(proxy: string | null): Record<string, string> {
  const clean = proxy?.trim();
  if (!clean) return {};
  return { proxyUrl: clean, proxy_url: clean };
}
