import type { StorageValue } from "zustand/middleware";

export interface PendingWrite<S> {
  timer: number;
  value: StorageValue<S>;
}
