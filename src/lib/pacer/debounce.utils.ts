import type { Cell } from "@/lib/state/signal.store";

import type { DebounceOptions, PacerState } from "@/types/pacer";

import {
  createSimpleCell,
  normalizeMaxWait,
  normalizeWait,
  resolveEnabled,
  scheduleTask,
  type ScheduledTask,
} from "./shared.utils";

export class Debouncer<TArgs extends unknown[]> {
  readonly status: Cell<PacerState>;
  #task: (...args: TArgs) => void;
  #wait: DebounceOptions["wait"];
  #leading: boolean;
  #trailing: boolean;
  #maxWait: number | undefined;
  #enabled: DebounceOptions["enabled"];
  #mode: DebounceOptions["mode"];
  #onExecute: DebounceOptions["onExecute"];
  #timer: ScheduledTask | null = null;
  #maxTimer: ScheduledTask | null = null;
  #lastArgs: TArgs | undefined;
  #windowStart = 0;

  constructor(task: (...args: TArgs) => void, options: DebounceOptions) {
    this.#task = task;
    this.#wait = options.wait;
    this.#leading = options.leading ?? false;
    this.#trailing = options.trailing ?? true;
    this.#maxWait = normalizeMaxWait(options.maxWait);
    this.#enabled = options.enabled ?? true;
    this.#mode = options.mode ?? "timeout";
    this.#onExecute = options.onExecute;
    this.status = createSimpleCell<PacerState>({
      executionCount: 0,
      isPending: false,
      status: "idle",
    });
    this.#sync();
  }

  isEnabled(): boolean {
    return resolveEnabled(this.#enabled);
  }

  setOptions(next: Partial<DebounceOptions>): void {
    if (next.wait !== undefined) this.#wait = next.wait;
    if (next.leading !== undefined) this.#leading = next.leading;
    if (next.trailing !== undefined) this.#trailing = next.trailing;
    if ("maxWait" in next) this.#maxWait = normalizeMaxWait(next.maxWait);
    if (next.enabled !== undefined) this.#enabled = next.enabled;
    if (next.mode !== undefined) this.#mode = next.mode;
    if (next.onExecute !== undefined) this.#onExecute = next.onExecute;
    if (!this.isEnabled()) this.cancel();
    else this.#sync();
  }

  maybeExecute(...args: TArgs): void {
    if (!this.isEnabled()) return;
    if (this.#leading && this.#timer === null && this.#lastArgs === undefined) {
      this.#invoke(args);
      this.#cooldown();
      return;
    }
    if (!this.#trailing) {
      this.#cooldown();
      return;
    }
    this.#lastArgs = args;
    if (this.#timer === null) this.#windowStart = Date.now();
    this.#cooldown();
    this.#armMaxTimer();
    this.#sync();
  }

  cancel(): void {
    this.#timer?.cancel();
    this.#timer = null;
    this.#maxTimer?.cancel();
    this.#maxTimer = null;
    this.#lastArgs = undefined;
    this.#sync();
  }

  flush(): void {
    if (this.#timer === null && this.#maxTimer === null) return;
    const args = this.#lastArgs;
    this.#timer?.cancel();
    this.#timer = null;
    this.#maxTimer?.cancel();
    this.#maxTimer = null;
    this.#lastArgs = undefined;
    if (args !== undefined) this.#invoke(args);
    else this.#sync();
  }

  reset(): void {
    this.cancel();
    this.status.set({ ...this.status.get(), executionCount: 0 });
  }

  #cooldown(): void {
    this.#timer?.cancel();
    const mode = this.#mode ?? "timeout";
    this.#timer = scheduleTask(mode, normalizeWait(this.#wait), () => this.#onTimer());
    this.#windowStart = Date.now();
  }

  #armMaxTimer(): void {
    if (this.#maxWait === undefined || this.#maxTimer !== null) return;
    const delay = Math.max(0, this.#windowStart + this.#maxWait - Date.now());
    this.#maxTimer = scheduleTask("timeout", delay, () => this.#onMaxTimer());
  }

  #onTimer(): void {
    this.#timer = null;
    this.#settle();
  }

  #onMaxTimer(): void {
    this.#maxTimer = null;
    this.#settle();
  }

  #settle(): void {
    this.#timer?.cancel();
    this.#timer = null;
    this.#maxTimer?.cancel();
    this.#maxTimer = null;
    const args = this.#lastArgs;
    this.#lastArgs = undefined;
    if (args !== undefined) this.#invoke(args);
    else this.#sync();
  }

  #invoke(args: TArgs): void {
    this.#task(...args);
    this.#onExecute?.();
    const current = this.status.get();
    this.status.set({ ...current, executionCount: current.executionCount + 1 });
    this.#sync();
  }

  #sync(): void {
    const pending = this.#timer !== null;
    const status = !this.isEnabled() ? "disabled" : pending ? "pending" : "idle";
    const current = this.status.get();
    if (current.isPending === pending && current.status === status) return;
    this.status.set({ ...current, isPending: pending, status });
  }
}

export function debounce<TArgs extends unknown[]>(
  task: (...args: TArgs) => void,
  options: DebounceOptions
): (...args: TArgs) => void {
  const pacer = new Debouncer(task, options);
  return (...args: TArgs) => pacer.maybeExecute(...args);
}
