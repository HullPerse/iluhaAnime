import { sessionApi } from "@/api/session.api";
import { LOBBY_PROBE_INTERVAL_MS } from "@/config/lobby/common.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { SavedConnection } from "@/types/lobby";

export interface ProbeResult {
  online: boolean;
  rttMs: number | null;
}

const OFFLINE: ProbeResult = { online: false, rttMs: null };

export function useSavedProbes(connections: SavedConnection[]) {
  const endpointIds = connections.map((connection) => connection.endpointId);
  return useAppQuery<Record<string, ProbeResult>>("live", {
    queryFn: async () => {
      const results = await Promise.all(
        connections.map(async (connection) => {
          try {
            const probe = await sessionApi.probe(
              connection.endpointId,
              connection.addrs
            );
            return [connection.endpointId, probe] as const;
          } catch {
            return [connection.endpointId, OFFLINE] as const;
          }
        })
      );
      return Object.fromEntries(results);
    },
    queryKey: queryKeys.savedProbes(endpointIds),
    refetchInterval: LOBBY_PROBE_INTERVAL_MS,
  });
}
