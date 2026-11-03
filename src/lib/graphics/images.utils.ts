import { attemptSync } from "@hullperse/hp_utils/attempt";

const SOURCE_IMAGE_HOSTS = ["imglib.info", "cdnlibs.org", "animelib.org", "kodikplayer.com"];

export function isSourceImage(url: string): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  const [host, error] = attemptSync(() => new URL(trimmed).hostname.toLowerCase());
  if (error !== null) return false;
  return SOURCE_IMAGE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
