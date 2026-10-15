import { attempt } from "@/lib/utils/attempt.utils";

export function ignore(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

export function createCoalescedRunner(): (task: () => Promise<void>) => Promise<void> {
  let current: Promise<void> | null = null;
  let queued: (() => Promise<void>) | null = null;
  let waiters: Array<() => void> = [];

  const start = (task: () => Promise<void>): void => {
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
