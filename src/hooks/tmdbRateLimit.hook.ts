import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export type TmdbRateLimit = {
  remaining: number | null;
  resetAt: number | null;
  retryAfterSecs: number | null;
};

export function useTmdbRateLimit(pollMs = 2000) {
  const [rate, setRate] = useState<TmdbRateLimit>({
    remaining: null,
    resetAt: null,
    retryAfterSecs: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r = await invoke<TmdbRateLimit>("get_tmdb_rate_limit");
        if (!cancelled) setRate(r);
      } catch {
        // ignore, keep previous
      }
    };
    fetch();
    const id = window.setInterval(fetch, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return rate;
}
