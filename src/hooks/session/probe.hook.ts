import { sessionApi } from "@/api/session.api";
import { LOBBY_PROBE_INTERVAL_MS } from "@/config/lobby/common.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { SavedConnection } from "@/types/lobby";

/** One probe outcome. A rejected or timed-out dial counts as offline. */
export interface ProbeResult {
  online: boolean;
  /** Smoothed RTT in milliseconds; `null` while offline. */
  rttMs: number | null;
}

const OFFLINE: ProbeResult = { online: false, rttMs: null };

/**
 * Reachability of every saved room: probes all entries in one pass when the
 * address book mounts and re-probes every
 * [`LOBBY_PROBE_INTERVAL_MS`][interval] while it stays open. Individual
 * failures degrade to an offline result instead of failing the batch.
 *
 * [interval]: config/lobby/common.config.ts
 */
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
