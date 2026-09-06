import type { ImportBatchGroup } from "@/types/collection";

export function computeGroupProgress(groups: ImportBatchGroup[], processed: number): number[] {
  const done: number[] = [];
  let rest = Math.max(0, processed);
  for (const group of groups) {
    const take = Math.max(0, Math.min(group.count, rest));
    done.push(take);
    rest -= take;
  }
  return done;
}
