import { streamApi } from "@/api/stream.api";
import { buildVariantId } from "@/lib/player/streamHelpers.utils";
import { isNativeVariant } from "@/lib/player/streamPrefs.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { createLruCache, inflightFetch } from "@/lib/core/lruCache.utils";
import type { StreamingEpisode, StreamVariant } from "@/types/player/stream";
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

export function loadEpisodes(animeId: string): Promise<StreamingEpisode[]> {
  return catalogLoader(`episodes:${animeId}`, () => streamApi.episodes(animeId));
}

export function loadPlayers(episodeId: string): Promise<StreamVariant[]> {
  return variantLoader(`players:${episodeId}`, () => streamApi.players(episodeId));
}

export function loadSources(episodeId: string, variantId: string): Promise<StreamSource[]> {
  return sourceLoader(`sources:${episodeId}:${variantId}`, () =>
    streamApi.streamSources({ episodeId, variantId })
  );
}

export async function prefetchNativeSources(
  episodeId: string,
  variants: StreamVariant[],
  isCancelled: () => boolean = () => false
): Promise<void> {
  if (isCancelled()) return;
  await Promise.all(
    variants
      .filter(isNativeVariant)
      .map((variant) => attempt(loadSources(episodeId, buildVariantId(variant))))
  );
}
