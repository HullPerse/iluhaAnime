interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`cache:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > entry.ttl) {
      localStorage.removeItem(`cache:${key}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T, ttlMs = 5 * 60 * 1000) {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl: ttlMs };
    localStorage.setItem(`cache:${key}`, JSON.stringify(entry));
  } catch {}
}

export function clearCache(prefix?: string) {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(`cache:${prefix ?? ""}`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

export async function cachedInvoke<T>(
  cacheKey: string,
  invokeFn: () => Promise<T>,
  ttlMs = 5 * 60 * 1000,
): Promise<T> {
  const cached = getCached<T>(cacheKey);
  if (cached) {
    invokeFn()
      .then((fresh) => setCached(cacheKey, fresh, ttlMs))
      .catch(() => {});
    return cached;
  }

  const fresh = await invokeFn();
  setCached(cacheKey, fresh, ttlMs);
  return fresh;
}
