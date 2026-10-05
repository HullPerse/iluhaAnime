import {
  LOBBY_PING_BAR_COUNT,
  LOBBY_PING_BAR_THRESHOLDS_MS,
} from "@/config/lobby/common.config";

/**
 * How many signal bars a measured RTT fills: 5 bars below the first
 * threshold, then one fewer per threshold crossed, and a single bar at or
 * above the last. `null`/non-finite (no sample yet) draws an empty meter.
 */
export function pingBarCount(rttMs: number | null | undefined): number {
  if (rttMs === null || rttMs === undefined || !Number.isFinite(rttMs)) {
    return 0;
  }
  const slower = LOBBY_PING_BAR_THRESHOLDS_MS.findIndex(
    (threshold) => rttMs < threshold
  );
  if (slower === -1) {
    return 1;
  }
  return LOBBY_PING_BAR_COUNT - slower;
}
