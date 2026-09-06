import { useEffect, useState } from "react";

import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { TmdbRateLimit } from "@/types/collection";

export function useTmdbRateLimit(pollMs = 10000) {
  const [rate, setRate] = useState<TmdbRateLimit>({
    remaining: null,
    resetAt: null,
    retryAfterSecs: null,
  });

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r = await invokeTyped<TmdbRateLimit>("get_tmdb_rate_limit");
        if (!cancelled) setRate(r);
      } catch {}
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
