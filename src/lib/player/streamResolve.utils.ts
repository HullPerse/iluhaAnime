import { streamApi } from "@/api/stream.api";
import { attempt } from "@/lib/core/attempt.utils";
import { inflightFetch } from "@/lib/core/lruCache.utils";
import { loadWatch } from "@/lib/player/playback.utils";
import { RESUME_END_MARGIN, RESUME_MIN } from "@/lib/player/resume.utils";
import { pickSource } from "@/lib/search/sources.utils";
import { pickVariant } from "@/lib/player/streamPrefs.utils";
import type { StreamPlaybackResult } from "@/types/player/streamResolve";
import type { StreamVariant } from "@/types/player/stream";
import type { StreamSource } from "@/types/player/videoPlayer";

export const SOURCE_ID = "animelib";
export const SOURCE_NAME = "AnimeLib";

const playersInflight = new Map<string, Promise<StreamVariant[]>>();
const sourcesInflight = new Map<string, Promise<StreamSource[]>>();

export function loadPlayers(episodeId: string): Promise<StreamVariant[]> {
  return inflightFetch(playersInflight, episodeId, () => streamApi.players(episodeId));
}

export function loadSources(episodeId: string, variantId: string): Promise<StreamSource[]> {
  return inflightFetch(sourcesInflight, `${episodeId}:${variantId}`, () =>
    streamApi.streamSources({ episodeId, variantId })
  );
}

export function startPosition(watchKey: string, restart: boolean): Promise<number | undefined> {
  return restart ? Promise.resolve(undefined) : resumePosition(watchKey);
}

export async function resolvePlayable(
  mediaId: string,
  episodeId: string,
  watchKey: string,
  restart: boolean,
  defaultQuality: string
): Promise<StreamPlaybackResult> {
  const [prefsResult, resume] = await Promise.all([
    attempt(streamApi.prefsGet(SOURCE_ID, mediaId)),
    startPosition(watchKey, restart),
  ]);
  const prefs = prefsResult[0] ?? null;
  const remembered = prefs?.variantId ?? null;
  const [rowsResult, rememberedSources] = await Promise.all([
    attempt(loadPlayers(episodeId)),
    remembered ? attempt(loadSources(episodeId, remembered)) : null,
  ]);
  const [rows, rowsFailure] = rowsResult;
  const variant = rows ? pickVariant(rows, prefs) : null;
  if (rowsFailure || !variant) {
    return { failure: rowsFailure?.message ?? "" };
  }
  const variantId = `${variant.player}:${variant.id}`;
  const [sources, sourcesFailure] =
    remembered === variantId && rememberedSources
      ? rememberedSources
      : await attempt(loadSources(episodeId, variantId));
  const quality = prefs?.quality || defaultQuality;
  const source = sources ? pickSource(sources, quality) : null;
  if (sourcesFailure || !sources || !source) {
    return { failure: sourcesFailure?.message ?? "" };
  }
  return { playable: { variant, source, sources, variants: rows }, prefs, resume };
}

export async function prefetchEpisode(mediaId: string, episodeId: string): Promise<void> {
  const [prefs] = await attempt(streamApi.prefsGet(SOURCE_ID, mediaId));
  const remembered = prefs?.variantId ?? null;
  await Promise.all([
    attempt(loadPlayers(episodeId)),
    remembered ? attempt(loadSources(episodeId, remembered)) : null,
  ]);
}

export async function resumePosition(watchKey: string): Promise<number | undefined> {
  const [watch] = await attempt(loadWatch(watchKey));
  if (!watch || watch.position < RESUME_MIN) return undefined;
  const finished = watch.duration > 0 && watch.position >= watch.duration - RESUME_END_MARGIN;
  return finished ? undefined : watch.position;
}
