import { useCallback } from "react";

export function useLocalStorageCache<T>(key: string) {
  const load = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }, [key]);

  const save = useCallback(
    (data: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    },
    [key],
  );

  const remove = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
  }, [key]);

  return { load, save, remove } as const;
}
