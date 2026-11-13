import {
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
} from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { OpenedCard } from "@/types/api/cards";

import CardFace from "@/routes/components/collection/cardFace.cards";

export default function LabMatrix({ cards }: { cards: readonly OpenedCard[] }) {
  const { t } = useI18n();

  return (
    <div
      data-testid="lab-matrix"
      className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] items-start gap-2"
    >
      {cards.map((card) => {
        const combination = `${card.kind}:${card.rarity}:${card.variant}`;
        return (
          <figure
            key={`${card.entityId}:${combination}`}
            data-lab-combination={combination}
            className="m-0 flex min-w-0 flex-col gap-1"
          >
            <CardFace card={card} />
            <figcaption className="windows95-text text-hint leading-tight">
              {t(cardKindLabelKeys[card.kind])}, {t(cardRarityLabelKeys[card.rarity])},{" "}
              {t(cardVariantLabelKeys[card.variant])}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
