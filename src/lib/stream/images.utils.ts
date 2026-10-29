// Where a stream image comes from decides how it is fetched.
//
// AnimeLib and Kodik serve covers only when the request names the site as the
// referer, while AniList episode previews live on the streaming services' CDNs
// (Crunchyroll, HIDIVE and friends). Those hosts are unreachable without the
// AniList proxy in a blocked region and reject a foreign referer, so the two
// cases cannot share one request shape.

const SOURCE_IMAGE_HOSTS = ["imglib.info", "cdnlibs.org", "animelib.org", "kodikplayer.com"];

/** Whether an image URL belongs to the AnimeLib source rather than AniList. */
export function isSourceImage(url: string): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SOURCE_IMAGE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
