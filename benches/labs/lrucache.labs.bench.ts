import { bench, group } from "@pmndrs/labs";
// Direct bench of the shared LRU cache against a plain Map baseline.
// The cache backs media parsing and other hot lookups; this pins its
// overhead independent of any single caller.
// Budget (avg/iter, Ryzen 7 5800X/node 26, 2026-10-08): fill+hit 1.2ms,
// miss-heavy 2.1ms, eviction churn 13.5ms, Map baseline 377us.
// Regression threshold is labs minDelta 5%.

import { createLruCache } from "../../src/lib/utils/lruCache.utils";

const CAPACITY = 8000;

function makeKeys(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`media/title ${i % 9000}\nfile ${i}.mkv`);
  return out;
}

const KEYS_8K = makeKeys(8000);
const KEYS_16K = makeKeys(16_000);

group("lru-cache @utils @quick", () => {
  bench("fill 8k + hit all (steady state)", () => {
    const cache = createLruCache<string, number>(CAPACITY);
    for (let i = 0; i < KEYS_8K.length; i++) cache.set(KEYS_8K[i]!, i);
    let sum = 0;
    for (const key of KEYS_8K) sum += cache.get(key) ?? -1;
    return sum + cache.stats().hits;
  });

  bench("miss-heavy 8k unknown keys", () => {
    const cache = createLruCache<string, number>(CAPACITY);
    for (let i = 0; i < KEYS_8K.length; i++) cache.set(KEYS_8K[i]!, i);
    let sum = 0;
    for (let i = 0; i < KEYS_8K.length; i++) sum += cache.get(`unknown ${i}`) ?? -1;
    return sum + cache.stats().misses;
  });

  bench("eviction churn 16k into 8k cap", () => {
    const cache = createLruCache<string, number>(CAPACITY);
    for (let i = 0; i < KEYS_16K.length; i++) cache.set(KEYS_16K[i]!, i);
    const stats = cache.stats();
    return stats.size + stats.evictions;
  });

  bench("plain Map fill+get 8k (baseline)", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < KEYS_8K.length; i++) map.set(KEYS_8K[i]!, i);
    let sum = 0;
    for (const key of KEYS_8K) sum += map.get(key) ?? -1;
    return sum + map.size;
  });
});
