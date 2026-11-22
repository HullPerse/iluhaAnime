export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const width = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: width }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];

      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
