export async function applyBulkAction<T>(
  targets: readonly T[],
  act: (target: T) => Promise<unknown>
): Promise<{ done: number; failed: number }> {
  const results = await Promise.allSettled(targets.map((target) => act(target)));
  const failed = results.filter((result) => result.status === "rejected").length;
  return { done: results.length - failed, failed };
}
