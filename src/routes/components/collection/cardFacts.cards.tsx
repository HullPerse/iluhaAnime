import Select from "@/components/ui/select.component";
import {
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
} from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { isCardVariant } from "@/lib/cards/guards.utils";
import type { CardVariant, CollectionItem } from "@/types/api/cards";

import CardDate from "@/routes/components/collection/cardDate.cards";

export default function CardFacts({
  card,
  variants,
  source,
  onVariantChange,
}: {
  card: CollectionItem;
  variants: CollectionItem[];
  source: string;
  onVariantChange: (variant: CardVariant) => void;
}) {
  const { t } = useI18n();
  const title = card.title.trim() === "" ? t("collection.detail.unknown.title") : card.title;
  // The same finish may be owned at several rarities; the switch should list
  // each finish once.
  const variantChoices = variants.filter(
    (entry, index) => variants.findIndex((other) => other.variant === entry.variant) === index
  );
  // Dates describe the card, not the finish, so switching the variant never
  // changes the "obtained" age shown here.
  const cardFirstAt = variants.reduce(
    (earliest, entry) => Math.min(earliest, entry.firstObtainedAt),
    card.firstObtainedAt
  );
  const cardLastAt = variants.reduce(
    (latest, entry) => Math.max(latest, entry.lastObtainedAt),
    card.lastObtainedAt
  );

  return (
    <div className="cards-detail-body">
      <header className="cards-detail-head">
        <span className="cards-detail-kicker">{t(cardKindLabelKeys[card.kind])}</span>
        <h2 className="cards-detail-title">{title}</h2>
        <p className="cards-detail-source">{source}</p>
      </header>

      {variantChoices.length > 1 && (
        <div className="cards-detail-variant-select">
          <span className="windows95-text text-hint text-xs">{t("collection.detail.variant")}</span>
          <Select
            className="w-40"
            label={t("collection.detail.variant")}
            value={card.variant}
            options={variantChoices.map((entry) => ({
              value: entry.variant,
              label: t(cardVariantLabelKeys[entry.variant]),
            }))}
            onChange={(value) => {
              if (isCardVariant(value)) onVariantChange(value);
            }}
          />
        </div>
      )}

      <dl className="cards-detail-grid">
        <div>
          <dt>{t("collection.detail.rarity")}</dt>
          <dd>{t(cardRarityLabelKeys[card.rarity])}</dd>
        </div>
        {card.variant === "normal" ? null : (
          <div>
            <dt>{t("collection.detail.variant")}</dt>
            <dd>{t(cardVariantLabelKeys[card.variant])}</dd>
          </div>
        )}
        <div>
          <dt>{t("collection.value")}</dt>
          <dd className="cards-detail-value">
            <img src="/money.png" alt="" className="chubrik-icon" />
            <span className="tabular-nums">{card.value}</span>
          </dd>
        </div>
        <div>
          <dt>{t("collection.copies")}</dt>
          <dd className="tabular-nums">{card.copies}</dd>
        </div>
        <div>
          <dt>{t("collection.detail.first")}</dt>
          <dd>
            <CardDate timestamp={cardFirstAt} />
          </dd>
        </div>
        <div>
          <dt>{t("collection.detail.last")}</dt>
          <dd>
            <CardDate timestamp={cardLastAt} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
