import { attempt } from "@/lib/utils/attempt.utils";

export function ignore(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

/**
 * Creates a runner that coalesces overlapping async tasks: while a task is
 * in flight, further calls only remember the latest task and share a promise
 * that resolves once the runner goes idle (including the trailing run).
 * A rejected task never breaks the runner: waiters always resolve, so task
 * bodies must report their own errors (e.g. via `attempt` + reporters).
 */
export function createCoalescedRunner(): (task: () => Promise<void>) => Promise<void> {
  let current: Promise<void> | null = null;
  let queued: (() => Promise<void>) | null = null;
  let waiters: Array<() => void> = [];

  const start = (task: () => Promise<void>): void => {
    // Promise.resolve().then catches a sync throw inside the task body, and
    // attempt absorbs a rejection, so a failing task never breaks the runner.
    const run = attempt(Promise.resolve().then(task)).then(() => undefined);
    current = run;
    ignore(run.then(settle, settle));
  };

  const settle = (): void => {
    const next = queued;
    queued = null;
    if (!next) {
      current = null;
      const done = waiters;
      waiters = [];
      for (const resolve of done) resolve();
      return;
    }
    start(next);
  };

  return (task) => {
    if (current) {
      queued = task;
    } else {
      start(task);
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  };
}
