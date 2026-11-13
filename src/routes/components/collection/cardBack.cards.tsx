import { cn } from "cn";

import { cardRarityLabelKeys } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { CardRarity } from "@/types/api/cards";

const RARITY_CLASS: Record<CardRarity, string> = {
  junk: "cards-rarity-junk",
  common: "cards-rarity-common",
  rare: "cards-rarity-rare",
  epic: "cards-rarity-epic",
  legendary: "cards-rarity-legendary",
};

export default function CardBack({
  rarity,
  className,
}: {
  rarity: CardRarity;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      className={cn("cards-window cards-back", RARITY_CLASS[rarity], className)}
      data-card-face
      data-tilt="back"
      role="img"
      aria-label={t("collection.card.back")}
    >
      <div className="cards-back-frame" aria-hidden>
        <span className="cards-back-corner cards-back-corner-tl" />
        <span className="cards-back-corner cards-back-corner-tr" />
        <span className="cards-back-corner cards-back-corner-bl" />
        <span className="cards-back-corner cards-back-corner-br" />
      </div>
      <div className="cards-back-emblem" aria-hidden>
        <div className="cards-back-mark">
          <strong>ILUHA</strong>
          <span>card</span>
        </div>
      </div>
      <span className="cards-back-rarity">{t(cardRarityLabelKeys[rarity])}</span>
    </div>
  );
}
