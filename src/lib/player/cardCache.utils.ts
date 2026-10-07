import { readVideoCard } from "@/lib/player/playback.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { createLruCache, inflightFetch } from "@/lib/utils/lruCache.utils";

export interface CardArt {
  url: string;
  duration: number;
  size: number;
}

const CARD_CACHE_CAPACITY = 200;
const PREFETCH_CONCURRENCY = 2;
const NEIGHBOR_RADIUS = 2;

const cache = createLruCache<string, CardArt>(CARD_CACHE_CAPACITY);
const inflight = new Map<string, Promise<CardArt | null>>();
let prefetchGeneration = 0;

export function getCachedCard(path: string): CardArt | null {
  if (!path) return null;
  return cache.get(path) ?? null;
}

export function fetchVideoCard(path: string): Promise<CardArt | null> {
  if (!path) return Promise.resolve(null);
  const cached = cache.get(path);
  if (cached) return Promise.resolve(cached);
  return inflightFetch(inflight, path, () =>
    withFallback<CardArt | null>(
      readVideoCard(path).then((card) => {
        const next: CardArt = {
          url: assetUrl(card.path),
          duration: card.duration,
          size: card.size,
        };
        cache.set(path, next);
        return next;
      }),
      null
    )
  );
}

export function orderCardPaths(paths: string[], activePath: string): string[] {
  const unique: string[] = [];
  for (const path of paths) {
    if (!path || unique.includes(path)) continue;
    unique.push(path);
  }
  if (unique.length === 0) return unique;
  const activeIndex = unique.findIndex((path) => path.toLowerCase() === activePath.toLowerCase());
  const origin = activeIndex === -1 ? 0 : activeIndex;
  const ordered: string[] = [];
  for (let distance = 0; distance < unique.length; distance += 1) {
    const after = origin + distance;
    const before = origin - distance;
    if (after < unique.length && !ordered.includes(unique[after])) {
      ordered.push(unique[after]);
    }
    if (before >= 0 && !ordered.includes(unique[before])) {
      ordered.push(unique[before]);
    }
  }
  return ordered;
}

function preloadImage(url: string): void {
  if (typeof Image === "undefined") return;
  const image = new Image();
  image.src = url;
}

async function runWave(paths: string[], generation: number): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(PREFETCH_CONCURRENCY, Math.max(paths.length, 1)) },
    async () => {
      while (generation === prefetchGeneration) {
        const index = cursor;
        cursor += 1;
        if (index >= paths.length) return;
        const path = paths[index];
        if (!path || cache.has(path) || inflight.has(path)) continue;
        const art = await fetchVideoCard(path);
        if (generation !== prefetchGeneration) return;
        if (art) preloadImage(art.url);
      }
    }
  );
  await Promise.all(workers);
}

export function scheduleCardPrefetch(paths: string[], activePath: string): void {
  const ordered = orderCardPaths(paths, activePath);
  if (ordered.length === 0) return;
  const generation = prefetchGeneration + 1;
  prefetchGeneration = generation;
  const waveA = ordered.slice(0, NEIGHBOR_RADIUS * 2 + 1);
  const waveB = ordered.slice(waveA.length);
  const run = async (): Promise<void> => {
    await runWave(waveA, generation);
    if (generation !== prefetchGeneration) return;
    await runWave(waveB, generation);
  };
  window.setTimeout(() => {
    run().catch(() => undefined);
  }, 0);
}

export function resetCardCache(): void {
  cache.clear();
  inflight.clear();
  prefetchGeneration += 1;
}
