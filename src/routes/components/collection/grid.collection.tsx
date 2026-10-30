import type { GridCollectionProps } from "@/types/anilist/collection";

import { GridPagedView } from "@/routes/components/collection/grid/paged.grid";
import { GridScrollView } from "@/routes/components/collection/grid/scroll.grid";

export default function GridCollection({
  items,
  statuses,
  display,
  selectedId,
  onOpen,
  onEdit,
  onSetStatus,
  groups,
  collapsedStatuses,
  onToggleStatusCollapsed,
  onAddToStatus,
}: GridCollectionProps) {
  if (groups?.length || display === "scroll")
    return (
      <GridScrollView
        items={items}
        statuses={statuses}
        selectedId={selectedId}
        onOpen={onOpen}
        onEdit={onEdit}
        onSetStatus={onSetStatus}
        groups={groups}
        collapsedStatuses={collapsedStatuses}
        onToggleStatusCollapsed={onToggleStatusCollapsed}
        onAddToStatus={onAddToStatus}
      />
    );
  return (
    <GridPagedView
      items={items}
      statuses={statuses}
      selectedId={selectedId}
      onOpen={onOpen}
      onEdit={onEdit}
      onSetStatus={onSetStatus}
    />
  );
}
