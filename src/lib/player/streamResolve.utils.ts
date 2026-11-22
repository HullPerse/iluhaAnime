import { streamApi } from "@/api/stream.api";
import { attempt } from "@hullperse/hp_utils/attempt";
import { inflightFetch } from "@hullperse/hp_utils/lruCache";
import { loadWatch } from "@/lib/player/playback.utils";
import { RESUME_END_MARGIN, RESUME_MIN } from "@/lib/player/resume.utils";
import { pickSource } from "@/lib/search/sources.utils";
import { pickVariant } from "@/lib/player/streamPrefs.utils";
import type { StreamPlaybackResult } from "@/types/player/streamResolve";
import type { StreamSourceId, StreamVariant } from "@/types/player/stream";
import type { StreamSource } from "@/types/player/videoPlayer";

const playersInflight = new Map<string, Promise<StreamVariant[]>>();
const sourcesInflight = new Map<string, Promise<StreamSource[]>>();

function loadPlayers(source: StreamSourceId, episodeId: string): Promise<StreamVariant[]> {
  return inflightFetch(playersInflight, `${source}:${episodeId}`, () =>
    streamApi.players(episodeId, source)
  );
}

function loadSources(
  source: StreamSourceId,
  episodeId: string,
  variantId: string
): Promise<StreamSource[]> {
  return inflightFetch(sourcesInflight, `${source}:${episodeId}:${variantId}`, () =>
    streamApi.streamSources({ episodeId, variantId }, source)
  );
}

function startPosition(watchKey: string, restart: boolean): Promise<number | undefined> {
  return restart ? Promise.resolve(undefined) : resumePosition(watchKey);
}

export async function resolvePlayable(
  sourceId: StreamSourceId,
  mediaId: string,
  episodeId: string,
  watchKey: string,
  restart: boolean,
  defaultQuality: string
): Promise<StreamPlaybackResult> {
  const [prefsResult, resume] = await Promise.all([
    attempt(streamApi.prefsGet(sourceId, mediaId)),
    startPosition(watchKey, restart),
  ]);
  const prefs = prefsResult[0] ?? null;
  const [rows, rowsFailure] = await attempt(loadPlayers(sourceId, episodeId));
  const variant = rows ? pickVariant(rows, prefs) : null;

  if (rowsFailure || !variant) {
    return { failure: rowsFailure?.message ?? "" };
  }

  const variantId = `${variant.player}:${variant.id}`;
  const [sources, sourcesFailure] = await attempt(loadSources(sourceId, episodeId, variantId));
  const quality = prefs?.quality || defaultQuality;
  const source = sources ? pickSource(sources, quality) : null;

  if (sourcesFailure || !sources || !source) {
    return { failure: sourcesFailure?.message ?? "" };
  }

  return { playable: { variant, source, sources, variants: rows }, prefs, resume };
}

export async function prefetchEpisode(
  sourceId: StreamSourceId,
  mediaId: string,
  episodeId: string
): Promise<void> {
  if (sourceId === "allanime") return;

  const [prefs] = await attempt(streamApi.prefsGet(sourceId, mediaId));
  const remembered = prefs?.variantId ?? null;
  await Promise.all([
    attempt(loadPlayers(sourceId, episodeId)),
    remembered ? attempt(loadSources(sourceId, episodeId, remembered)) : null,
  ]);
}

async function resumePosition(watchKey: string): Promise<number | undefined> {
  const [watch] = await attempt(loadWatch(watchKey));

  if (!watch || watch.position < RESUME_MIN) return undefined;
  const finished = watch.duration > 0 && watch.position >= watch.duration - RESUME_END_MARGIN;

  return finished ? undefined : watch.position;
}
