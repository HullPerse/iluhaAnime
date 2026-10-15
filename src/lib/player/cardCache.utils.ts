import { fileNameFromPath } from "@/lib/media/parse.utils";
import { scheduleTask } from "@/lib/pacer/shared.utils";
import { readVideoCard } from "@/lib/player/playback.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { createLruCache, inflightFetch } from "@/lib/utils/lruCache.utils";
import { ignore } from "@/lib/utils/promise.utils";

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
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    unique.push(path);
  }
  if (unique.length === 0) return unique;
  const lowered = activePath.toLowerCase();
  const activeIndex = unique.findIndex((path) => path.toLowerCase() === lowered);
  const origin = activeIndex === -1 ? 0 : activeIndex;
  const ordered: string[] = [];
  for (let distance = 0; distance < unique.length; distance += 1) {
    const after = origin + distance;
    const before = origin - distance;
    if (after < unique.length) {
      ordered.push(unique[after]);
    }
    if (distance === 0 || before < 0) continue;
    ordered.push(unique[before]);
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
  scheduleTask("timeout", 0, () => {
    ignore(run());
  });
}

export function neighborCardPaths(paths: string[], activePath: string, activeIndex = -1): string[] {
  if (
    activeIndex >= 0 &&
    activeIndex < paths.length &&
    isSameMediaPath(paths[activeIndex] ?? "", activePath)
  ) {
    const neighbors: string[] = [];
    const before = paths[activeIndex - 1];
    const after = paths[activeIndex + 1];
    if (before) neighbors.push(before);
    if (after) neighbors.push(after);
    return neighbors;
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    unique.push(path);
  }
  if (unique.length === 0) return unique;
  const lowered = activePath.toLowerCase();
  const found = unique.findIndex((path) => path.toLowerCase() === lowered);
  const origin = found === -1 ? 0 : found;
  const neighbors: string[] = [];
  if (origin - 1 >= 0) neighbors.push(unique[origin - 1]);
  if (origin + 1 < unique.length) neighbors.push(unique[origin + 1]);
  return neighbors;
}

export function isSameMediaPath(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return fileNameFromPath(left).toLowerCase() === fileNameFromPath(right).toLowerCase();
}

export function scheduleNeighborPrefetch(
  paths: string[],
  activePath: string,
  activeIndex = -1
): void {
  const neighbors = neighborCardPaths(paths, activePath, activeIndex).filter(
    (path) => !cache.has(path) && !inflight.has(path)
  );
  if (neighbors.length === 0) return;
  const generation = prefetchGeneration + 1;
  prefetchGeneration = generation;
  const run = async (): Promise<void> => {
    await runWave(neighbors, generation);
  };
  scheduleTask("timeout", 0, () => {
    ignore(run());
  });
}

export function resetCardCache(): void {
  cache.clear();
  inflight.clear();
  prefetchGeneration += 1;
}
