import { useEffect, useRef } from "react";

import { attempt } from "@/lib/utils/attempt.utils";
import type { PollingOptions } from "@/types/polling";

export interface LiveResourceOptions<K> extends PollingOptions<K> {
  pauseOnHidden?: boolean;
}

const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_EXPONENT_CAP = 4;

function isHidden(pauseOnHidden: boolean | undefined): boolean {
  if (pauseOnHidden === false) return false;
  return typeof document !== "undefined" && document.hidden;
}

export function useLiveResource<K>(options: LiveResourceOptions<K>): void {
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
      const { collectKeys, fetch, onSettle, onStart, shouldFetch, pauseOnHidden } =
        optionsRef.current;
      if (isHidden(pauseOnHidden)) return;
      const now = Date.now();
      for (const key of collectKeys()) {
        if (inFlightRef.current.has(key)) continue;
        if ((retryAtRef.current.get(key) ?? 0) > now) continue;
        if (!shouldFetch(key)) continue;

        inFlightRef.current.add(key);
        onStart?.(key);
        (async () => {
          const [ok, error] = await attempt((async () => fetch(key))());
          if (error || !ok) scheduleBackoff(key);
          else {
            attemptsRef.current.delete(key);
            retryAtRef.current.delete(key);
          }
          inFlightRef.current.delete(key);
          onSettle?.(key);
        })();
      }
    };

    sweep();
    const timer = window.setInterval(sweep, intervalMs);
    const onVisible = () => {
      if (!document.hidden) sweep();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs]);
}
