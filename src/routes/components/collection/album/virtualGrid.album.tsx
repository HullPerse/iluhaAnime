import { useVirtualizer } from "@tanstack/react-virtual";
import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useRef, type RefObject } from "react";

import { CARD_GRID_GAP } from "@/config/cards/grid.config";
import { useGridMetrics } from "@/hooks/cards/gridMetrics.hook";
import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { cardTileKey } from "@/lib/cards/album.utils";
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
  onVisibleCardsChange,
}: {
  cards: readonly T[];
  total: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  resetKey: string;
  onOpen?: (card: T) => void;
  onVisibleCardsChange?: (cards: readonly T[]) => void;
}) {
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);
  const { columns, rowHeight } = useGridMetrics(scrollRef);
  const itemCount = Math.max(total, cards.length);
  const rowCount = Math.ceil(itemCount / columns);
  const loadedRows = Math.ceil(cards.length / columns);
  const requestedLength = useRef<number>(-1);

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
    if (onVisibleCardsChange === undefined || virtualRows.length === 0) return;
    const first = virtualRows[0]?.index ?? 0;
    const last = virtualRows.at(-1)?.index ?? first;
    // oxlint-disable-next-line react-doctor/no-pass-live-state-to-parent
    onVisibleCardsChange(
      cards.slice(first * columns, Math.min(cards.length, (last + 1) * columns))
    );
  }, [cards, columns, onVisibleCardsChange, virtualRows]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || loadedRows === 0) return;

    if (lastIndex < loadedRows - 2) return;

    if (requestedLength.current === cards.length) return;
    requestedLength.current = cards.length;
    onLoadMore();
  }, [cards.length, hasNextPage, isFetchingNextPage, lastIndex, loadedRows, onLoadMore, resetKey]);

  return (
    <div
      className="relative w-full"
      style={{ height: rowVirtualizer.getTotalSize() }}
      aria-busy={isFetchingNextPage}
      {...tilt}
    >
      {virtualRows.map((virtualRow) => {
        const start = virtualRow.index * columns;
        const usedKeys = new Set<string>();

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

              const key = cardTileKey(card);
              const tileKey = usedKeys.has(key) ? `${key}:${index}` : key;
              usedKeys.add(key);

              return (
                <CardTile
                  key={tileKey}
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
