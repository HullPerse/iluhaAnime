import type { PollingOptions } from "@/types/core/polling";

export interface LiveResourceOptions<K> extends PollingOptions<K> {
  pauseOnHidden?: boolean;
}
