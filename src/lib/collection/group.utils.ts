import { isPublicStatus } from "@/lib/collection/status.utils";
import type {
  CollectionGroup,
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
} from "@/types/collection";

const UNKNOWN_STATUS_COLOR = "#9ca3af";

/**
 * Grouped rows carry the per-status header, which is the only place a public status
 * shows its counter and add button. The user's grouping setting is one way to get
 * there; opening a public status tab is the other, so its header is always reachable
 * without toggling grouping on.
 */
export function shouldGroupByStatus(
  groupByStatus: boolean,
  selectedStatus: CollectionStatus | "all",
  statuses: readonly CollectionStatusDef[]
): boolean {
  if (groupByStatus) return true;
  return statuses.some((status) => status.id === selectedStatus && isPublicStatus(status));
}

export function groupItemsByStatus(
  items: CollectionItem[],
  statuses: CollectionStatusDef[]
): CollectionGroup[] {
  const defs = [...statuses].sort((a, b) => a.order - b.order);
  const defById = new Map(defs.map((def) => [def.id, def]));
  const buckets = new Map<string, { def: CollectionStatusDef; items: CollectionItem[] }>();

  for (const item of items) {
    const def = defById.get(item.status) ?? {
      id: item.status,
      label: item.status,
      color: UNKNOWN_STATUS_COLOR,
      order: defs.length,
      isCore: false,
      kind: "private",
    };
    let bucket = buckets.get(item.status);
    if (!bucket) {
      bucket = { def, items: [] };
      buckets.set(item.status, bucket);
    }
    bucket.items.push(item);
  }

  return [...buckets.values()]
    .sort((a, b) => a.def.order - b.def.order)
    .map(({ def, items }) => ({ status: def, items }));
}
