import { attemptSync } from "@hullperse/hp_utils/attempt";

const SOURCE_IMAGE_HOSTS = [
  "imglib.info",
  "cdnlibs.org",
  "animelib.org",
  "kodikplayer.com",
  "allanime.day",
];

const ALLANIME_IMAGE_HOST = "allanime.day";

export function isSourceImage(url: string): boolean {
  const trimmed = url?.trim();

  if (!trimmed) return false;
  const [host, error] = attemptSync(() => new URL(trimmed).hostname.toLowerCase());

  if (error !== null) return false;

  return SOURCE_IMAGE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** AllAnime's image CDN only answers requests that carry its site referer. */
export function isAllAnimeImage(url: string): boolean {
  const trimmed = url?.trim();

  if (!trimmed) return false;
  const [host, error] = attemptSync(() => new URL(trimmed).hostname.toLowerCase());

  if (error !== null) return false;

  return host === ALLANIME_IMAGE_HOST || host.endsWith(`.${ALLANIME_IMAGE_HOST}`);
}
