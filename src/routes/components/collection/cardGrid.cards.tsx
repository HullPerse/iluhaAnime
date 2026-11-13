import { useVirtualizer } from "@tanstack/react-virtual";
import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { settingsAtoms } from "@/store/settings.store";

import CardTile from "@/routes/components/collection/cardTile.cards";
import type { CardTileItem } from "@/routes/components/collection/cardTile.cards";

const GAP = 8;
const HORIZONTAL_PADDING = 16;
const SMALL_CARD_WIDTH = 144;
const LARGE_CARD_WIDTH = 176;
const FALLBACK_COLUMNS = 2;
const FALLBACK_ROW_HEIGHT = 280;

function useGridMetrics(scrollRef: RefObject<HTMLDivElement | null>) {
  const [metrics, setMetrics] = useState({
    columns: FALLBACK_COLUMNS,
    rowHeight: FALLBACK_ROW_HEIGHT,
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const update = () => {
      const width = element.clientWidth - HORIZONTAL_PADDING;
      if (width <= 0) return;
      const minCardWidth = width >= 640 ? LARGE_CARD_WIDTH : SMALL_CARD_WIDTH;
      const columns = Math.max(1, Math.floor((width + GAP) / (minCardWidth + GAP)));
      const cardWidth = (width - GAP * (columns - 1)) / columns;
      const rowHeight = cardWidth * 1.5 + GAP;
      setMetrics((current) =>
        current.columns === columns && Math.abs(current.rowHeight - rowHeight) < 1
          ? current
          : { columns, rowHeight }
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef]);

  return metrics;
}

export default function CardGrid<T extends CardTileItem>({
  cards,
  onOpen,
}: {
  cards: readonly T[];
  onOpen?: (card: T) => void;
}) {
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);

  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] items-start gap-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
      {...tilt}
    >
      {cards.map((card, index) => (
        <CardTile
          key={`${card.kind}:${card.entityId}:${card.rarity}:${card.variant}:${index}`}
          card={card}
          onOpen={onOpen === undefined ? undefined : () => onOpen(card)}
        />
      ))}
    </div>
  );
}

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
              gap: GAP,
              paddingBottom: GAP,
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
