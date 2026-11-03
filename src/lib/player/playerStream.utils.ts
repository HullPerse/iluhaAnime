import { buildVariantId, buildWatchKey } from "@/lib/player/streamHelpers.utils";
import { pickVariant } from "@/lib/player/streamPrefs.utils";
import { loadEpisodes, loadPlayers, loadSources } from "@/lib/core/sessionCache.utils";
import { pickSource, toVariantSources } from "@/lib/search/sources.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import type { StreamingEpisode } from "@/types/player/stream";
import type { StreamOpen, StreamSource } from "@/types/player/videoPlayer";

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
    variants: [],
    watchKey: buildWatchKey(session.sourceId, session.mediaId, episode.id),
    resume: 0,
    paused: true,
  };
}

export async function resolveNextStream(session: StreamOpen): Promise<StreamOpen | null> {
  const episodes = await loadEpisodes(session.mediaId);
  const next = episodes
    .filter((episode) => episode.number > session.episodeNumber)
    .sort((left, right) => left.number - right.number)[0];
  if (!next) return null;
  return resolveEpisodeStream(session, next);
}
