export type PacerWait = number | (() => number);
export type PacerEnabled = boolean | (() => boolean);
export type PacerMode = "timeout" | "raf";
export type PacerStatus = "disabled" | "idle" | "pending";

export interface PacerState {
  executionCount: number;
  isPending: boolean;
  status: PacerStatus;
}

export interface DebounceOptions {
  wait: PacerWait;
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
  enabled?: PacerEnabled;
  mode?: PacerMode;
  onExecute?: () => void;
}

export interface ThrottleOptions {
  wait: PacerWait;
  leading?: boolean;
  trailing?: boolean;
  enabled?: PacerEnabled;
  mode?: PacerMode;
  onExecute?: () => void;
}

export interface DebouncedValueOptions<T> extends DebounceOptions {
  equal?: (previous: T, next: T) => boolean;
}

export interface ThrottledValueOptions<T> extends ThrottleOptions {
  equal?: (previous: T, next: T) => boolean;
}

export interface PacedControls {
  cancel: () => void;
  flush: () => void;
  executionCount: number;
  isPending: boolean;
  status: PacerStatus;
}
