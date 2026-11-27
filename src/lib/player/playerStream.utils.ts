import { buildVariantId, buildWatchKey } from "@/lib/player/streamHelpers.utils";
import { pickVariant } from "@/lib/player/streamPrefs.utils";
import { loadEpisodes, loadPlayers, loadSources } from "@/lib/core/player/sessionCache.utils";
import { pickSource, toVariantSources } from "@/lib/search/sources.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { tr } from "@/lib/locale/i18n.utils";
import type { StreamSourceId, StreamingEpisode } from "@/types/player/stream";
import type { StreamOpen, StreamSource } from "@/types/player/videoPlayer";

/** Resolve the same episode and voice-over again after its media URL stops working. */
export async function refreshStream(session: StreamOpen): Promise<StreamOpen> {
  const sources = await loadSources(
    session.episodeId,
    session.variantId,
    session.sourceId as StreamSourceId,
    true
  );
  const source = pickSource(sources, session.quality);

  if (!source) throw new Error(tr("stream.error.noSources"));

  return {
    ...session,
    mediaUrl: source.url,
    quality: source.label,
    headers: source.headers,
    sources: toVariantSources(sources),
    subtitles: source.subtitles,
  };
}

async function episodeSources(
  episodeId: string,
  session: StreamOpen,
  refresh: boolean
): Promise<{ sources: StreamSource[]; variantId: string } | null> {
  const [direct] = await attempt(
    loadSources(episodeId, session.variantId, session.sourceId as StreamSourceId, refresh)
  );

  if (direct && direct.length > 0) {
    return { sources: direct, variantId: session.variantId };
  }

  const [rows] = await attempt(loadPlayers(episodeId, session.sourceId as StreamSourceId));
  const variant = rows ? pickVariant(rows, { variantId: session.variantId }) : null;

  if (!variant) return null;
  const variantId = buildVariantId(variant);
  const [sources] = await attempt(
    loadSources(episodeId, variantId, session.sourceId as StreamSourceId, refresh)
  );

  return sources && sources.length > 0 ? { sources, variantId } : null;
}

export async function resolveEpisodeStream(
  session: StreamOpen,
  episode: StreamingEpisode,
  paused = true,
  refresh = false
): Promise<StreamOpen | null> {
  const resolved = await episodeSources(episode.id, session, refresh);

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
    subtitles: source.subtitles,
    variants: [],
    watchKey: buildWatchKey(session.sourceId, session.mediaId, episode.id),
    resume: 0,
    paused,
  };
}

export async function resolveNextStream(
  session: StreamOpen,
  paused = true,
  refresh = false
): Promise<StreamOpen | null> {
  const episodes = await loadEpisodes(session.mediaId, session.sourceId as StreamSourceId);
  const next = episodes
    .filter((episode) => episode.number > session.episodeNumber)
    .sort((left, right) => left.number - right.number)[0];

  if (!next) return null;

  return resolveEpisodeStream(session, next, paused, refresh);
}
