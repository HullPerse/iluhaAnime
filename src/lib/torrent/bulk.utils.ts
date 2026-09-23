import type { TorrentCheckResult } from "@/types/torrent";

export function splitRecheckOutcome<T>(
  targets: readonly T[],
  results: readonly (TorrentCheckResult | null)[]
): { lost: T[]; failed: number } {
  const lost: T[] = [];
  let failed = 0;
  targets.forEach((target, index) => {
    const result = results[index];
    if (result === undefined || result === null) {
      failed += 1;
    } else if (result.missing.length > 0) {
      lost.push(target);
    }
  });
  return { lost, failed };
}

export function pruneSelection<T extends { id: number }>(
  selected: ReadonlySet<number>,
  allowed: readonly T[]
): ReadonlySet<number> {
  if (selected.size === 0) return selected;
  const allowedIds = new Set(allowed.map((row) => row.id));
  const keep = new Set<number>();
  let dropped = false;
  for (const id of selected) {
    if (allowedIds.has(id)) keep.add(id);
    else dropped = true;
  }
  return dropped ? keep : selected;
}

export async function applyBulkAction<T>(
  targets: readonly T[],
  act: (target: T) => Promise<unknown>
): Promise<{ done: number; failed: number }> {
  const results = await Promise.allSettled(targets.map((target) => act(target)));
  const failed = results.filter((result) => result.status === "rejected").length;
  return { done: results.length - failed, failed };
}
