import type { StreamOpen } from "@/types/player/videoPlayer";

/** A position below one second is a fresh start, not a resume. */
const MIN_RESUME_SECONDS = 1;

/**
 * The other route to try when the current one stops delivering data.
 *
 * A stream can be opened directly or through the configured proxy, and either
 * side can be the broken one: a CDN that throttles the direct route, or a VPN
 * that died mid-session. `undefined` means there is no second route to try
 * (no proxy configured).
 */
export function alternateProxyUrl(
  current: string | null | undefined,
  configured: string | null
): string | null | undefined {
  const proxy = configured?.trim() || null;
  if (proxy === null) return undefined;
  return (current ?? null) === proxy ? null : proxy;
}

/**
 * One key per logical stream, so retries caused by this guard keep their
 * attempt budget while a pick of another voice-over/quality starts over.
 */
export function streamRouteKey(session: StreamOpen): string {
  return `${session.mediaId}:${session.episodeId}:${session.variantId}:${session.quality}`;
}

/** Where a retried open should start: the live position, then the session's. */
export function streamRetryPosition(
  session: StreamOpen,
  timePos: number
): number | undefined {
  const position = Number.isFinite(timePos) && timePos >= MIN_RESUME_SECONDS ? timePos : null;
  const resumed = position ?? session.resume ?? null;
  return resumed !== null && resumed >= MIN_RESUME_SECONDS ? resumed : undefined;
}
