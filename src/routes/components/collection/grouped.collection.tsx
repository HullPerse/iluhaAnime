import { ChevronDown, ChevronRight } from "lucide-react";

import { statusColorOf } from "@/lib/collection.utils";
import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
} from "@/types/collection";

import { CollectionCard } from "./card.collection";
import { useStatusLabel } from "./context.collection";

/**
 * Library rendered as one collapsible section per status, styled like the
 * player categories: a Windows95 header (chevron + color swatch + label +
 * count) with the cards laid out underneath when open.
 */
export function CollectionStatusGroups({
  items,
  statuses,
  collapsed,
  onToggleCollapsed,
  onEdit,
  onOpen,
  onSetStatus,
}: {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  collapsed: Set<string>;
  onToggleCollapsed: (statusId: string) => void;
  onEdit: (item: CollectionItem) => void;
  onOpen: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  const statusLabel = useStatusLabel();
  const groups = [...statuses]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.id,
      color: s.color,
      items: items.filter((i) => i.status === s.id),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="windows95-border flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto bg-white p-1">
      {groups.map((group) => {
        const open = !collapsed.has(group.id);
        return (
          <section
            key={group.id}
            className="windows95-active-border bg-primary flex flex-col"
          >
            <div className="windows95-text flex w-full items-center gap-1 px-0.5 py-0.5 select-none">
              <button
                type="button"
                aria-expanded={open}
                aria-label={statusLabel(group.id)}
                className="windows95-text hover:bg-surface focus-visible:outline-text flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
                onClick={() => onToggleCollapsed(group.id)}
              >
                {open ? (
                  <ChevronDown className="size-3 shrink-0" />
                ) : (
                  <ChevronRight className="size-3 shrink-0" />
                )}
                {group.color && (
                  <span
                    className="windows95-border inline-block size-2.5 shrink-0"
                    style={{
                      backgroundColor: statusColorOf(statuses, group.id),
                    }}
                    aria-hidden
                  />
                )}
                <span className="truncate select-none">
                  {statusLabel(group.id)}
                </span>
              </button>
              <span className="text-hint ml-auto text-xs whitespace-nowrap select-none">
                {group.items.length}
              </span>
            </div>
            {open && (
              <div className="flex flex-wrap gap-1 p-1">
                {group.items.map((item) => (
                  <CollectionCard
                    key={item.id}
                    item={item}
                    onEdit={onEdit}
                    onOpen={onOpen}
                    onSetStatus={onSetStatus}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
