import type { CollectionGroup, CollectionItem, CollectionStatusDef } from "@/types/collection";

const UNKNOWN_STATUS_COLOR = "#9ca3af";

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
