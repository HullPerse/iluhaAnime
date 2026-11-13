import { cardRarityLabelKeys } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { CardRarity } from "@/types/api/cards";

const RARITY_PIPS: Record<CardRarity, number> = {
  junk: 1,
  common: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

export default function RarityBadge({ rarity }: { rarity: CardRarity }) {
  const { t } = useI18n();
  const label = t(cardRarityLabelKeys[rarity]);
  const filled = RARITY_PIPS[rarity];

  return (
    <span className="cards-meta" aria-label={label}>
      <span className="windows95-text text-hint">{label}</span>
      <span className="cards-pips" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="cards-pip" data-on={index < filled} />
        ))}
      </span>
    </span>
  );
}
