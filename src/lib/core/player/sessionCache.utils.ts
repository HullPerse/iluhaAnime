import { streamApi } from "@/api/stream.api";
import { buildVariantId } from "@/lib/player/streamHelpers.utils";
import { isNativeVariant } from "@/lib/player/streamPrefs.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { createLruCache, inflightFetch } from "@hullperse/hp_utils/lruCache";
import { DEFAULT_STREAM_SOURCE } from "@/config/player/streamSources.config";
import type { StreamSourceId, StreamingEpisode, StreamVariant } from "@/types/player/stream";
import type { StreamSource } from "@/types/player/videoPlayer";

const TTL_MS = 5 * 60_000;
const CAPACITY = 64;

interface TimedEntry<V> {
  value: V;
  at: number;
}

function createTimedLoader<V>() {
  const cache = createLruCache<string, TimedEntry<V>>(CAPACITY);
  const inflight = new Map<string, Promise<V>>();

  return (key: string, load: () => Promise<V>): Promise<V> => {
    const hit = cache.get(key);

    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);

    return inflightFetch(inflight, key, () =>
      load().then((value) => {
        cache.set(key, { value, at: Date.now() });

        return value;
      })
    );
  };
}

const catalogLoader = createTimedLoader<StreamingEpisode[]>();
const variantLoader = createTimedLoader<StreamVariant[]>();
const sourceLoader = createTimedLoader<StreamSource[]>();

export function loadEpisodes(
  animeId: string,
  source: StreamSourceId = DEFAULT_STREAM_SOURCE
): Promise<StreamingEpisode[]> {
  return catalogLoader(`episodes:${source}:${animeId}`, () => streamApi.episodes(animeId, source));
}

export function loadPlayers(
  episodeId: string,
  source: StreamSourceId = DEFAULT_STREAM_SOURCE
): Promise<StreamVariant[]> {
  return variantLoader(`players:${source}:${episodeId}`, () =>
    streamApi.players(episodeId, source)
  );
}

export function loadSources(
  episodeId: string,
  variantId: string,
  source: StreamSourceId = DEFAULT_STREAM_SOURCE
): Promise<StreamSource[]> {
  return sourceLoader(`sources:${source}:${episodeId}:${variantId}`, () =>
    streamApi.streamSources({ episodeId, variantId }, source)
  );
}

export async function prefetchNativeSources(
  episodeId: string,
  variants: StreamVariant[],
  isCancelled: () => boolean = () => false,
  source: StreamSourceId = DEFAULT_STREAM_SOURCE
): Promise<void> {
  if (isCancelled()) return;
  const queue = variants.filter(isNativeVariant);
  let cursor = 0;
  const worker = async () => {
    while (!isCancelled() && cursor < queue.length) {
      const variant = queue[cursor++];
      await attempt(loadSources(episodeId, buildVariantId(variant), source));
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
}
