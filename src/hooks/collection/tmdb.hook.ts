import { useState } from "react";

import { tmdbApi } from "@/api/tmdb.api";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { TmdbRateLimit } from "@/types/collection";

export function useTmdbRateLimit(pollMs = 10000, enabled = true) {
  const [rate, setRate] = useState<TmdbRateLimit>({
    remaining: null,
    resetAt: null,
    retryAfterSecs: null,
  });
  const tmdbKeySet = useSettingsStore((s) => s.tmdbKeySet);

  useLiveResource({
    intervalMs: pollMs,
    enabled: enabled && tmdbKeySet,
    collectKeys: () => ["tmdb-rate"],
    shouldFetch: () => true,
    fetch: async () => {
      const [next, error] = await attempt(tmdbApi.rateLimit());
      if (error) return false;
      setRate(next);
      return true;
    },
  });

  return rate;
}
