import { cardRarityLabelKeys, cardVariantLabelKeys } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { CardGiftStack } from "@/types/api/cards";

type GiftStack = Pick<CardGiftStack, "rarity" | "variant" | "copies">;

export default function GiftStacks({ cards }: { cards: readonly GiftStack[] }) {
  const { t } = useI18n();

  return (
    <div className="cards-gift-detail-stacks">
      <span className="cards-gift-detail-label">{t("collection.gift.contents")}</span>
      <ul>
        {cards.map((card) => (
          <li key={`${card.rarity}-${card.variant}`} className="cards-gift-detail-stack">
            <span>
              {t(cardRarityLabelKeys[card.rarity])} · {t(cardVariantLabelKeys[card.variant])}
            </span>
            <span className="tabular-nums">×{card.copies}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
