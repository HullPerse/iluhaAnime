import { useState } from "react";

import { usePolling } from "@/hooks/polling.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { TmdbRateLimit } from "@/types/collection";

export function useTmdbRateLimit(pollMs = 10000) {
  const [rate, setRate] = useState<TmdbRateLimit>({
    remaining: null,
    resetAt: null,
    retryAfterSecs: null,
  });

  usePolling({
    intervalMs: pollMs,
    enabled: true,
    collectKeys: () => ["tmdb-rate"],
    shouldFetch: () => true,
    fetch: async () => {
      const [rate, error] = await attempt(invokeTyped<TmdbRateLimit>("get_tmdb_rate_limit"));
      if (error) return false;
      setRate(rate);
      return true;
    },
  });

  return rate;
}
