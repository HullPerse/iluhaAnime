import { useCallback, useSyncExternalStore } from "react";

type RecordCell<T> = {
  get: () => Record<string, T>;
  subscribe: (listener: () => void) => () => void;
};

/** Subscribes to one key of a record cell, ignoring updates of the other keys. */
export function useRecordValue<T>(cell: RecordCell<T>, key: string): T | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let current = cell.get()[key];

      return cell.subscribe(() => {
        const next = cell.get()[key];

        if (Object.is(next, current)) return;
        current = next;
        onStoreChange();
      });
    },
    [cell, key]
  );
  const getSnapshot = useCallback(() => cell.get()[key], [cell, key]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
