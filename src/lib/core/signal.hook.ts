import { useSyncExternalStore } from "react";

import type { Cell, Derived } from "@/types/core/signal";

export function useCell<T>(handle: Cell<T>): T {
  return useSyncExternalStore(handle.subscribe, handle.get, handle.get);
}

export function useDerived<T>(handle: Derived<T>): T {
  return useSyncExternalStore(handle.subscribe, handle.get, handle.get);
}
