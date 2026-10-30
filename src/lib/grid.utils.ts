import type { CollectionGroup, CollectionItem, GridVirtualRow } from "@/types/collection";

function chunkItems(items: CollectionItem[], columns: number): CollectionItem[][] {
  const out: CollectionItem[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    out.push(items.slice(i, i + columns));
  }
  return out;
}

export function buildRows(
  groups: CollectionGroup[],
  columns: number,
  collapsedStatuses?: Set<string>
): GridVirtualRow[] {
  const out: GridVirtualRow[] = [];
  for (const group of groups) {
    out.push({ kind: "header", status: group.status });
    if (collapsedStatuses?.has(group.status.id)) continue;
    for (const chunk of chunkItems(group.items, columns)) {
      out.push({ kind: "grid", items: chunk });
    }
  }
  return out;
}
