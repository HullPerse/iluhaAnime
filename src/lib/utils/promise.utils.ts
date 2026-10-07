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
    let run: Promise<void>;
    try {
      run = task();
    } catch {
      run = Promise.resolve();
    }
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
