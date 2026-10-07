import { useEffect, useMemo } from "react";

import { Debouncer } from "@/lib/pacer/debounce.utils";
import { createSimpleCell } from "@/lib/pacer/shared.utils";
import { Throttler } from "@/lib/pacer/throttle.utils";
import { useCell } from "@/lib/state/signal.hook";
import type {
  DebounceOptions,
  DebouncedValueOptions,
  PacedControls,
  ThrottledValueOptions,
  ThrottleOptions,
} from "@/types/pacer";

export type PacedCallback<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
  flush: () => void;
};

interface PacerSnapshot {
  executionCount: number;
  isPending: boolean;
  status: PacedControls["status"];
}

interface TaskBox<TArgs extends unknown[]> {
  current: ((...args: TArgs) => void) | undefined;
}

function readControls(
  task: { cancel: () => void; flush: () => void },
  state: PacerSnapshot
): PacedControls {
  return {
    cancel: () => task.cancel(),
    executionCount: state.executionCount,
    flush: () => task.flush(),
    isPending: state.isPending,
    status: state.status,
  };
}

export function useDebouncedValue<T>(value: T, options: DebouncedValueOptions<T>): [T, PacedControls] {
  const { wait, leading, trailing, maxWait, enabled, mode, equal } = options;
  const scoped = useMemo(() => {
    const committed = createSimpleCell<{ current: T } | null>(null);
    const box = {
      dirty: false,
      equal: Object.is as (previous: T, next: T) => boolean,
      initial: undefined as T | undefined,
      latest: undefined as T | undefined,
      options: { wait: 0 } as DebounceOptions,
    };
    const engine = new Debouncer<[T]>((next) => {
      const prev = box.latest;
      box.latest = next;
      if (prev === undefined || !box.equal(prev, next)) committed.set({ current: next });
    }, box.options);
    return { box, committed, engine };
  }, []);
  const { box, committed, engine } = scoped;
  useEffect(() => {
    box.equal = equal ?? Object.is;
    box.options = { enabled, leading, maxWait, mode, trailing, wait };
    engine.setOptions(box.options);
    if (!box.dirty) {
      box.dirty = true;
      box.initial = value;
      box.latest = value;
      engine.maybeExecute(value);
      return;
    }
    if (!engine.isEnabled()) {
      engine.cancel();
      if (box.latest !== undefined && !box.equal(box.latest, value)) {
        box.latest = value;
        committed.set({ current: value });
      }
      return;
    }
    if (box.latest === undefined || !box.equal(box.latest, value)) engine.maybeExecute(value);
  }, [engine, committed, box, value, wait, leading, trailing, maxWait, enabled, mode, equal]);
  useEffect(() => () => engine.cancel(), [engine]);
  const snapshot = useCell(committed);
  const status = useCell(engine.status);
  const shown = snapshot === null ? (box.initial ?? value) : snapshot.current;
  return [shown, readControls(engine, status)];
}

export function useThrottledValue<T>(value: T, options: ThrottledValueOptions<T>): [T, PacedControls] {
  const { wait, leading, trailing, enabled, mode, equal } = options;
  const scoped = useMemo(() => {
    const committed = createSimpleCell<{ current: T } | null>(null);
    const box = {
      dirty: false,
      equal: Object.is as (previous: T, next: T) => boolean,
      initial: undefined as T | undefined,
      latest: undefined as T | undefined,
      options: { wait: 0 } as ThrottleOptions,
    };
    const engine = new Throttler<[T]>((next) => {
      const prev = box.latest;
      box.latest = next;
      if (prev === undefined || !box.equal(prev, next)) committed.set({ current: next });
    }, box.options);
    return { box, committed, engine };
  }, []);
  const { box, committed, engine } = scoped;
  useEffect(() => {
    box.equal = equal ?? Object.is;
    box.options = { enabled, leading, mode, trailing, wait };
    engine.setOptions(box.options);
    if (!box.dirty) {
      box.dirty = true;
      box.initial = value;
      box.latest = value;
      return;
    }
    if (!engine.isEnabled()) {
      engine.cancel();
      if (box.latest !== undefined && !box.equal(box.latest, value)) {
        box.latest = value;
        committed.set({ current: value });
      }
      return;
    }
    if (box.latest === undefined || !box.equal(box.latest, value)) engine.maybeExecute(value);
  }, [engine, committed, box, value, wait, leading, trailing, enabled, mode, equal]);
  useEffect(() => () => engine.cancel(), [engine]);
  const snapshot = useCell(committed);
  const status = useCell(engine.status);
  const shown = snapshot === null ? (box.initial ?? value) : snapshot.current;
  return [shown, readControls(engine, status)];
}

export function useDebouncedCallback<TArgs extends unknown[]>(
  task: (...args: TArgs) => void,
  options: DebounceOptions
): PacedCallback<TArgs> {
  const box = useMemo<TaskBox<TArgs>>(() => ({ current: undefined }), []);
  const pacer = useMemo(
    () =>
      new Debouncer<TArgs>(
        (...args) => {
          box.current?.(...args);
        },
        { wait: 0 }
      ),
    [box]
  );
  const { wait, leading, trailing, maxWait, enabled, mode } = options;
  useEffect(() => {
    box.current = task;
  });
  useEffect(() => {
    pacer.setOptions({ enabled, leading, maxWait, mode, trailing, wait });
  }, [pacer, wait, leading, trailing, maxWait, enabled, mode]);
  useEffect(() => () => pacer.cancel(), [pacer]);
  return useMemo(() => {
    const call = (...args: TArgs): void => {
      pacer.maybeExecute(...args);
    };
    return Object.assign(call, {
      cancel: () => pacer.cancel(),
      flush: () => pacer.flush(),
    });
  }, [pacer]);
}

export function useThrottledCallback<TArgs extends unknown[]>(
  task: (...args: TArgs) => void,
  options: ThrottleOptions
): PacedCallback<TArgs> {
  const box = useMemo<TaskBox<TArgs>>(() => ({ current: undefined }), []);
  const pacer = useMemo(
    () =>
      new Throttler<TArgs>(
        (...args) => {
          box.current?.(...args);
        },
        { wait: 0 }
      ),
    [box]
  );
  const { wait, leading, trailing, enabled, mode } = options;
  useEffect(() => {
    box.current = task;
  });
  useEffect(() => {
    pacer.setOptions({ enabled, leading, mode, trailing, wait });
  }, [pacer, wait, leading, trailing, enabled, mode]);
  useEffect(() => () => pacer.cancel(), [pacer]);
  return useMemo(() => {
    const call = (...args: TArgs): void => {
      pacer.maybeExecute(...args);
    };
    return Object.assign(call, {
      cancel: () => pacer.cancel(),
      flush: () => pacer.flush(),
    });
  }, [pacer]);
}
