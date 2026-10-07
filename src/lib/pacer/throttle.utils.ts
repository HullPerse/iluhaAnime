import type { Cell } from "@/lib/state/signal.store";

import type { PacerState, ThrottleOptions } from "@/types/pacer";

import {
  createSimpleCell,
  normalizeWait,
  resolveEnabled,
  scheduleTask,
  type ScheduledTask,
} from "./shared.utils";

export class Throttler<TArgs extends unknown[]> {
  readonly status: Cell<PacerState>;
  #task: (...args: TArgs) => void;
  #wait: ThrottleOptions["wait"];
  #leading: boolean;
  #trailing: boolean;
  #enabled: ThrottleOptions["enabled"];
  #mode: ThrottleOptions["mode"];
  #onExecute: ThrottleOptions["onExecute"];
  #timer: ScheduledTask | null = null;
  #lastArgs: TArgs | undefined;
  #lastExec: number | null = null;

  constructor(task: (...args: TArgs) => void, options: ThrottleOptions) {
    this.#task = task;
    this.#wait = options.wait;
    this.#leading = options.leading ?? true;
    this.#trailing = options.trailing ?? true;
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

  setOptions(next: Partial<ThrottleOptions>): void {
    if (next.wait !== undefined) this.#wait = next.wait;
    if (next.leading !== undefined) this.#leading = next.leading;
    if (next.trailing !== undefined) this.#trailing = next.trailing;
    if (next.enabled !== undefined) this.#enabled = next.enabled;
    if (next.mode !== undefined) this.#mode = next.mode;
    if (next.onExecute !== undefined) this.#onExecute = next.onExecute;
    if (!this.isEnabled()) this.cancel();
    else this.#sync();
  }

  maybeExecute(...args: TArgs): void {
    if (!this.isEnabled()) return;
    const now = Date.now();
    const wait = normalizeWait(this.#wait);
    if (this.#leading && (this.#lastExec === null || now - this.#lastExec >= wait)) {
      this.#invoke(args, now);
      return;
    }
    if (!this.#trailing) return;
    this.#lastArgs = args;
    if (this.#timer === null) {
      const elapsed = this.#lastExec === null ? 0 : now - this.#lastExec;
      const mode = this.#mode ?? "timeout";
      this.#timer = scheduleTask(mode, Math.max(0, wait - elapsed), () => this.#onTimer());
      this.#sync();
    }
  }

  cancel(): void {
    this.#timer?.cancel();
    this.#timer = null;
    this.#lastArgs = undefined;
    this.#sync();
  }

  flush(): void {
    if (this.#lastArgs === undefined) return;
    this.#invoke(this.#lastArgs, Date.now());
  }

  reset(): void {
    this.cancel();
    this.#lastExec = null;
    this.status.set({ ...this.status.get(), executionCount: 0 });
  }

  #onTimer(): void {
    this.#timer = null;
    const args = this.#lastArgs;
    this.#lastArgs = undefined;
    if (args !== undefined) this.#invoke(args, Date.now());
    else this.#sync();
  }

  #invoke(args: TArgs, now: number): void {
    this.#timer?.cancel();
    this.#timer = null;
    this.#lastArgs = undefined;
    this.#lastExec = now;
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

export function throttle<TArgs extends unknown[]>(
  task: (...args: TArgs) => void,
  options: ThrottleOptions
): (...args: TArgs) => void {
  const pacer = new Throttler(task, options);
  return (...args: TArgs) => pacer.maybeExecute(...args);
}
