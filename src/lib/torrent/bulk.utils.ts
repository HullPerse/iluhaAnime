import type { TorrentCheckResult } from "@/types/torrent";

/**
 * Splits a bulk recheck into what it fixed and what is still incomplete. Only the latter may be
 * recreated, because recreating is lossy; a failed check (`null`) counts as neither, so a broken
 * check can never push a torrent down the destructive path.
 */
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

export async function applyBulkAction<T>(
  targets: readonly T[],
  act: (target: T) => Promise<unknown>
): Promise<{ done: number; failed: number }> {
  const results = await Promise.allSettled(targets.map((target) => act(target)));
  const failed = results.filter((result) => result.status === "rejected").length;
  return { done: results.length - failed, failed };
}
