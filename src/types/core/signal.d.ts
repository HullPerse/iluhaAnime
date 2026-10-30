export type Unsubscriber = () => void;

export interface Cell<T> {
  readonly id: number;
  get: () => T;
  set: (value: T) => void;
  update: (fn: (prev: T) => T) => void;
  subscribe: (fn: () => void) => Unsubscriber;
}

export interface Derived<T> {
  get: () => T;
  subscribe: (fn: () => void) => Unsubscriber;
}

export interface Readable<T> {
  get: () => T;
  subscribe: (fn: () => void) => Unsubscriber;
}

export interface SignalStore {
  cell: <T>(initial: T) => Cell<T>;
  atom: <T>(key: string, initial: T) => Cell<T>;
  derive: <T>(deps: Readable<unknown>[], fn: (args: unknown[]) => T) => Derived<T>;
  batch: (fn: () => void) => void;
  snapshot: () => Record<string, unknown>;
  subscribeAll: (fn: () => void) => Unsubscriber;
}
