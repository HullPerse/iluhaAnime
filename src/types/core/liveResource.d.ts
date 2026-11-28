import type { PollingOptions } from "@/types/core/polling";

export interface LiveResourceOptions<K> extends PollingOptions<K> {
  pauseOnHidden?: boolean;
  /** Minimum gap between visibility-triggered sweeps. Defaults to `intervalMs`. */
  minSweepIntervalMs?: number;
}
