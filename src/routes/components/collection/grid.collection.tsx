import type { Virtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";

import type { CollectionItem, CollectionStatus } from "@/types/collection";

import { CollectionCard } from "./card.collection";

export function CollectionItemsGrid({
  items,
  rowVirtualizer,
  scrollRef,
  columns,
  onEdit,
  onOpen,
  onSetStatus,
}: {
  items: CollectionItem[];
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollRef: RefObject<HTMLDivElement | null>;
  columns: number;
  onEdit: (item: CollectionItem) => void;
  onOpen: (item: CollectionItem) => void;
  onSetStatus?: (item: CollectionItem, status: CollectionStatus) => void;
}) {
  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1"
    >
      {items.length <= 24 ? (
        <div
          className="flex flex-wrap content-start gap-1 p-1"
          style={{ minHeight: "100%" }}
        >
          {items.map((item) => (
            <CollectionCard
              key={item.id}
              item={item}
              onEdit={onEdit}
              onOpen={onOpen}
              onSetStatus={onSetStatus}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            const rowItems = items.slice(start, start + columns);
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex gap-1 px-1 py-1">
                  {rowItems.map((item) => (
                    <CollectionCard
                      key={item.id}
                      item={item}
                      onEdit={onEdit}
                      onOpen={onOpen}
                      onSetStatus={onSetStatus}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
