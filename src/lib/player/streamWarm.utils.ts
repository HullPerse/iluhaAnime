import { streamApi } from "@/api/stream.api";
import { attempt } from "@hullperse/hp_utils/attempt";

/** A warm entry is useful for a short while, not for the whole session. */
const TTL_MS = 2 * 60_000;
const MAX_ENTRIES = 24;

const warmedAt = new Map<string, number>();

function supported(url: string): boolean {
  return /^https?:\/\//iu.test(url);
}

function keyFor(url: string, proxyUrl: string | null): string {
  return `${proxyUrl?.trim() || "direct"}|${url}`;
}

/**
 * Ask the backend for the first 64 KiB of a resolved source, through the route
 * that will actually play it.
 *
 * mpv opens its own connection, so this is not a byte cache: the shared win is
 * the OS DNS cache and a warm CDN edge, which is where a cold first segment
 * spends its first hundreds of milliseconds. Hovering a voice-over or a quality
 * gives the user time to decide, and a duplicate warm within two minutes is
 * skipped, so moving the pointer over a list does not hammer the CDN.
 */
export async function warmStreamUrl(
  url: string,
  headers: Record<string, string>,
  proxyUrl: string | null
): Promise<void> {
  const target = url.trim();
  if (!supported(target)) return;
  const now = Date.now();
  const key = keyFor(target, proxyUrl);
  const previous = warmedAt.get(key);
  if (previous !== undefined && now - previous < TTL_MS) return;

  warmedAt.set(key, now);
  if (warmedAt.size > MAX_ENTRIES) {
    const oldest = warmedAt.keys().next().value;
    if (oldest !== undefined) warmedAt.delete(oldest);
  }

  // Best effort: a warm that fails must never surface an error of its own.
  await attempt(streamApi.warm(target, headers, proxyUrl));
}

/** Reset the hover memory when settings or a test need a clean start. */
export function resetStreamWarmCache(): void {
  warmedAt.clear();
}
