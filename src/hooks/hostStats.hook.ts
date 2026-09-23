import { useEffect, useState } from "react";

import { systemApi } from "@/api/system.api";
import { usePolling } from "@/hooks/polling.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import type { HostStats } from "@/types/ipc";

const HOST_STATS_INTERVAL_MS = 2000;

export function useHostStats(enabled: boolean): HostStats | null {
  const [stats, setStats] = useState<HostStats | null>(null);
  usePolling({
    intervalMs: HOST_STATS_INTERVAL_MS,
    enabled,
    collectKeys: () => ["host"],
    shouldFetch: () => true,
    fetch: async () => {
      const [stats, error] = await attempt(systemApi.getHostStats());
      if (error) {
        setStats(null);
        return false;
      }
      setStats(stats);
      return true;
    },
  });
  useEffect(() => {
    if (!enabled) setStats(null);
  }, [enabled]);
  return stats;
}
