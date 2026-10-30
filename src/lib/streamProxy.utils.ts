/**
 * The AnimeLib proxy travels as both spellings the Rust commands accept, the
 * same convention the torrent and AniList clients use. An unset value sends no
 * keys at all, so an empty settings row cannot override a direct connection.
 */
export function streamProxyArgs(proxy: string | null): Record<string, string> {
  const clean = proxy?.trim();
  if (!clean) return {};
  return { proxyUrl: clean, proxy_url: clean };
}
