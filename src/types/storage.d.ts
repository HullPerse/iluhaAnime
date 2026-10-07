import type { StorageValue } from "zustand/middleware";

import type { Debouncer } from "@/lib/pacer/debounce.utils";

export interface PendingWrite<S> {
  task: Debouncer<[]>;
  value: StorageValue<S>;
}
