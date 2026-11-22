import { useCell } from "@hullperse/hp_utils/react";

import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { cardTileKey } from "@/lib/cards/album.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { CardTileItem } from "@/types/ui/collection";

import CardTile from "@/routes/components/collection/cardTile.cards";

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
      {cards.map((card) => (
        <CardTile
          key={cardTileKey(card)}
          card={card}
          onOpen={onOpen === undefined ? undefined : () => onOpen(card)}
        />
      ))}
    </div>
  );
}
