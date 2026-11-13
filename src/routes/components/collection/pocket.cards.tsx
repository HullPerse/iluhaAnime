import { useCell } from "@hullperse/hp_utils/react";

import { useI18n } from "@/hooks/i18n.hook";
import { cardsAtoms } from "@/store/cards.store";
import type { CollectionItem } from "@/types/api/cards";

import CardFace from "@/routes/components/collection/cardFace.cards";

export default function BinderPocket({
  card,
  index,
  onOpen,
}: {
  card: CollectionItem | null;
  index: number;
  onOpen?: (card: CollectionItem) => void;
}) {
  const { t } = useI18n();
  const newSince = useCell(cardsAtoms.albumNewSince);

  if (card === null) {
    return (
      <div
        data-testid="binder-pocket"
        data-pocket-index={index}
        data-empty="true"
        className="cards-binder-pocket cards-binder-pocket-empty"
        aria-label={t("collection.binder.empty.pocket")}
      >
        <span aria-hidden>-</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="binder-pocket"
      data-pocket-index={index}
      className="cards-binder-pocket"
      onClick={onOpen === undefined ? undefined : () => onOpen(card)}
    >
      <CardFace card={card} />
      {card.firstObtainedAt > newSince && (
        <span className="cards-new-stamp" data-testid="card-new">
          {t("collection.card.new")}
        </span>
      )}
      {card.copies > 1 && (
        <span className="windows95-active-border bg-primary windows95-text absolute top-1 right-1 z-10 px-1 font-bold">
          x{card.copies}
        </span>
      )}
    </button>
  );
}
