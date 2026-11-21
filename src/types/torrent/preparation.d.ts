import type { PickerTorrent } from "@/types/torrent/torrent";

export interface PreparationSource {
  kind: "magnet" | "file";
  value: string;
}

/**
 * idle -> preparing -> pending -> confirming -> idle
 *
 * `token` belongs to the preparation attempt that produced the phase. Async
 * work may only advance the machine while its token is still current, so a
 * cancelled or superseded attempt cannot install a stale picker or start a
 * second download.
 */
export type PreparationPhase =
  | { phase: "idle" }
  | { phase: "preparing"; token: number }
  | { phase: "pending"; token: number; pending: PickerTorrent }
  | { phase: "confirming"; token: number; pending: PickerTorrent };

export interface PreparationState {
  phase: PreparationPhase;
  queue: PreparationSource[];
  nextToken: number;
}
