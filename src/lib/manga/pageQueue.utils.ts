interface PageTask {
  page: number;
  run: () => Promise<void>;
}

const pageQueues = new Map<string, { tasks: PageTask[]; running: boolean }>();

async function drainPageQueue(key: string, queue: { tasks: PageTask[]; running: boolean }) {
  while (queue.tasks.length > 0) {
    const task = queue.tasks.shift();

    if (!task) break;
    await task.run();
  }

  queue.running = false;

  if (queue.tasks.length === 0 && pageQueues.get(key) === queue) pageQueues.delete(key);
}

export function enqueueMangaPage<T>(key: string, page: number, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let queue = pageQueues.get(key);

    if (!queue) {
      queue = { tasks: [], running: false };
      pageQueues.set(key, queue);
    }

    const active = queue;
    active.tasks.push({
      page,
      run: () => Promise.resolve().then(run).then(resolve).catch(reject),
    });
    active.tasks.sort((left, right) => left.page - right.page);

    if (!active.running) {
      active.running = true;
      queueMicrotask(() => {
        drainPageQueue(key, active).catch(() => undefined);
      });
    }
  });
}
