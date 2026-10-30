import type { PollingOptions } from "@/types/polling";

export interface LiveResourceOptions<K> extends PollingOptions<K> {
  pauseOnHidden?: boolean;
}
