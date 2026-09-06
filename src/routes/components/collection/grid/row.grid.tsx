import type { CollectionItem, CollectionStatus, CollectionStatusDef } from "@/types/collection";

import { CollectionCard } from "../card.collection";

export function GridRow({
  rowItems,
  columns,
  statuses,
  selectedId,
  onOpen,
  onEdit,
  onSetStatus,
}: {
  rowItems: CollectionItem[];
  columns: number;
  statuses: CollectionStatusDef[];
  selectedId?: string | null;
  onOpen?: (item: CollectionItem) => void;
  onEdit?: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  return (
    <div className="flex w-full gap-2">
      {rowItems.map((item) => (
        <div key={item.id} className="min-w-0 flex-1">
          <CollectionCard
            item={item}
            statuses={statuses}
            selected={selectedId != null && item.id === selectedId}
            onOpen={onOpen}
            onEdit={onEdit}
            onSetStatus={onSetStatus}
          />
        </div>
      ))}
      {rowItems.length < columns &&
        Array.from({ length: columns - rowItems.length }, (_, fill) => (
          <div key={`fill-${fill}`} aria-hidden className="min-w-0 flex-1" />
        ))}
    </div>
  );
}
