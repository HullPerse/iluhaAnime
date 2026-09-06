import type { LruCache, LruCacheStats } from "@/types/cache";

export type { LruCache, LruCacheStats };

export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  const maxSize = Math.max(1, Math.floor(capacity));
  const map = new Map<K, V>();
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const evictOldest = (): void => {
    const oldest = map.keys().next();
    if (!oldest.done) {
      map.delete(oldest.value);
      evictions += 1;
    }
  };

  return {
    get(key: K): V | undefined {
      const value = map.get(key);
      if (value === undefined) {
        misses += 1;
        return undefined;
      }
      map.delete(key);
      map.set(key, value);
      hits += 1;
      return value;
    },
    peek(key: K): V | undefined {
      return map.get(key);
    },
    set(key: K, value: V): void {
      if (map.has(key)) map.delete(key);
      else if (map.size >= maxSize) evictOldest();
      map.set(key, value);
    },
    has(key: K): boolean {
      return map.has(key);
    },
    delete(key: K): boolean {
      return map.delete(key);
    },
    clear(): void {
      map.clear();
    },
    stats(): LruCacheStats {
      return { capacity: maxSize, size: map.size, hits, misses, evictions };
    },
  };
}
