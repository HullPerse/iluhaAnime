// Next episode resolution for a stream session.
//
// The player window owns the session, so the next episode is resolved from the
// session alone: the season comes from the media id, the voice-over is matched
// by its hoster plus team id, and the quality is the one already in use when it
// still exists. Nothing here touches local files.

import { buildVariantId, buildWatchKey } from "@/lib/streamHelpers.utils";
import { pickVariant } from "@/lib/streamPrefs.utils";
import { loadEpisodes, loadPlayers, loadSources } from "@/lib/sessionCache.utils";
import { pickSource, toVariantSources } from "@/lib/sources.utils";
import { attempt } from "@/lib/attempt.utils";
import type { StreamingEpisode } from "@/types/stream";
import type { StreamOpen, StreamSource } from "@/types/videoPlayer";

/**
 * The sources of another episode under the same voice-over. The remembered row
 * is tried first: when the title keeps the voice-over across episodes this is
 * one resolve, and only a missing row asks for the player list. The same-quality
 * preference degrades to the nearest lower quality.
 */
async function episodeSources(
  episodeId: string,
  session: StreamOpen
): Promise<{ sources: StreamSource[]; variantId: string } | null> {
  const [direct] = await attempt(loadSources(episodeId, session.variantId));
  if (direct && direct.length > 0) {
    return { sources: direct, variantId: session.variantId };
  }
  const [rows] = await attempt(loadPlayers(episodeId));
  const variant = rows ? pickVariant(rows, { variantId: session.variantId }) : null;
  if (!variant) return null;
  const variantId = buildVariantId(variant);
  const [sources] = await attempt(loadSources(episodeId, variantId));
  return sources && sources.length > 0 ? { sources, variantId } : null;
}

/**
 * The session of one chosen episode as the same voice-over and quality, or
 * null when that episode has no row for the voice-over any more.
 */
export async function resolveEpisodeStream(
  session: StreamOpen,
  episode: StreamingEpisode
): Promise<StreamOpen | null> {
  const resolved = await episodeSources(episode.id, session);
  if (!resolved) return null;
  const source = pickSource(resolved.sources, session.quality);
  if (!source) return null;

  return {
    ...session,
    episodeId: episode.id,
    episodeNumber: episode.number,
    episodeTitle: episode.title ?? "",
    variantId: source.variantId || resolved.variantId,
    quality: source.label,
    mediaUrl: source.url,
    headers: source.headers,
    sources: toVariantSources(resolved.sources),
    // Rows belong to the episode, so the next one starts without stale choices.
    variants: [],
    watchKey: buildWatchKey(session.sourceId, session.mediaId, episode.id),
    resume: 0,
    // Another episode also opens paused; playback is the user's call.
    paused: true,
  };
}

/**
 * The session of the next episode as the same voice-over and quality, or null
 * when the season has no further episode or the row disappeared.
 */
export async function resolveNextStream(session: StreamOpen): Promise<StreamOpen | null> {
  const episodes = await loadEpisodes(session.mediaId);
  const next = episodes
    .filter((episode) => episode.number > session.episodeNumber)
    .sort((left, right) => left.number - right.number)[0];
  if (!next) return null;
  return resolveEpisodeStream(session, next);
}
