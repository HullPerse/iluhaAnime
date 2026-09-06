import { useEffect, useRef } from "react";

import type { PollingOptions } from "@/types/polling";

export type { PollingOptions };

const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_EXPONENT_CAP = 4;

export function usePolling<K>(options: PollingOptions<K>): void {
  const { intervalMs, enabled = true } = options;

  const optionsRef = useRef(options);
  const inFlightRef = useRef<Set<K>>(new Set());
  const attemptsRef = useRef<Map<K, number>>(new Map());
  const retryAtRef = useRef<Map<K, number>>(new Map());

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!enabled) return;

    const scheduleBackoff = (key: K) => {
      const attempts = Math.min((attemptsRef.current.get(key) ?? 0) + 1, BACKOFF_EXPONENT_CAP + 1);
      attemptsRef.current.set(key, attempts);
      const delay = Math.min(
        BACKOFF_MAX_MS,
        BACKOFF_BASE_MS * 2 ** Math.min(attempts, BACKOFF_EXPONENT_CAP)
      );
      retryAtRef.current.set(key, Date.now() + delay);
    };

    const sweep = () => {
      const { collectKeys, fetch, onSettle, onStart, shouldFetch } = optionsRef.current;
      const now = Date.now();
      for (const key of collectKeys()) {
        if (inFlightRef.current.has(key)) continue;
        if ((retryAtRef.current.get(key) ?? 0) > now) continue;
        if (!shouldFetch(key)) continue;

        inFlightRef.current.add(key);
        onStart?.(key);
        Promise.resolve()
          .then(() => fetch(key))
          .then((ok) => {
            if (ok) {
              attemptsRef.current.delete(key);
              retryAtRef.current.delete(key);
              return;
            }
            scheduleBackoff(key);
          })
          .catch(() => scheduleBackoff(key))
          .finally(() => {
            inFlightRef.current.delete(key);
            onSettle?.(key);
          });
      }
    };

    sweep();
    const timer = window.setInterval(sweep, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
}
