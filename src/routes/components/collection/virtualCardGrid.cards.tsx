import { useVirtualizer } from "@tanstack/react-virtual";
import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useRef, type RefObject } from "react";

import { CARD_GRID_GAP } from "@/config/cards/grid.config";
import { useGridMetrics } from "@/hooks/cards/gridMetrics.hook";
import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { CardTileItem } from "@/types/ui/collection";

import CardTile from "@/routes/components/collection/cardTile.cards";

export function VirtualCardGrid<T extends CardTileItem>({
  cards,
  total,
  scrollRef,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
  onOpen,
}: {
  cards: readonly T[];
  total: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  resetKey: string;
  onOpen?: (card: T) => void;
}) {
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);
  const { columns, rowHeight } = useGridMetrics(scrollRef);
  const itemCount = Math.max(total, cards.length);
  const rowCount = Math.ceil(itemCount / columns);
  const loadedRows = Math.ceil(cards.length / columns);
  const requestedLength = useRef(-1);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 2,
  });

  useEffect(() => {
    requestedLength.current = -1;
  }, [resetKey]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastIndex = virtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || loadedRows === 0) return;
    if (lastIndex < loadedRows - 2) return;
    if (requestedLength.current === cards.length) return;
    requestedLength.current = cards.length;
    onLoadMore();
  }, [
    cards.length,
    hasNextPage,
    isFetchingNextPage,
    lastIndex,
    loadedRows,
    onLoadMore,
    resetKey,
  ]);

  return (
    <div
      className="relative w-full"
      style={{ height: rowVirtualizer.getTotalSize() }}
      aria-busy={isFetchingNextPage}
      {...tilt}
    >
      {virtualRows.map((virtualRow) => {
        const start = virtualRow.index * columns;
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            className="absolute top-0 left-0 grid w-full"
            style={{
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: CARD_GRID_GAP,
              paddingBottom: CARD_GRID_GAP,
            }}
          >
            {Array.from({ length: columns }, (_, offset) => {
              const index = start + offset;
              if (index >= itemCount) return null;
              const card = cards[index];
              if (card === undefined) {
                return (
                  <div
                    key={`placeholder-${index}`}
                    className="cards-binder-pocket cards-binder-pocket-empty"
                    aria-hidden
                  />
                );
              }
              return (
                <CardTile
                  key={`${card.kind}:${card.entityId}:${card.rarity}:${card.variant}:${index}`}
                  card={card}
                  onOpen={onOpen === undefined ? undefined : () => onOpen(card)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
