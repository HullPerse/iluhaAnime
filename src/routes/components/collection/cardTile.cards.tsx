import { cn } from "cn";
import { memo } from "react";
import { useCell } from "@hullperse/hp_utils/react";

import { useI18n } from "@/hooks/i18n.hook";
import { cardsAtoms } from "@/store/cards.store";

import type { CardTileItem } from "@/types/ui/collection";

import CardFace from "@/routes/components/collection/cardFace.cards";

function CardTile({ card, onOpen }: { card: CardTileItem; onOpen?: (card: CardTileItem) => void }) {
  const { t } = useI18n();
  const newSince = useCell(cardsAtoms.albumNewSince);
  const isNew = card.firstObtainedAt !== undefined && card.firstObtainedAt > newSince;
  const content = (
    <div className="relative min-w-0">
      <CardFace card={card} />
      {isNew && (
        <span className="cards-new-stamp" data-testid="card-new">
          {t("collection.card.new")}
        </span>
      )}
      {card.copies !== undefined && card.copies > 1 && (
        <span className="windows95-active-border bg-primary windows95-text absolute top-5 right-1 z-10 px-1 font-bold">
          x{card.copies}
        </span>
      )}
    </div>
  );

  if (onOpen === undefined) return content;

  return (
    <button
      type="button"
      className={cn(
        "block w-full cursor-pointer border-0 bg-transparent p-0 text-left",
        "hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-2"
      )}
      onClick={() => onOpen(card)}
    >
      {content}
    </button>
  );
}

export default memo(CardTile);
