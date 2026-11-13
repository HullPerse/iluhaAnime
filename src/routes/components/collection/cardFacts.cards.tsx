import Select from "@/components/ui/select.component";
import {
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
} from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";
import type { CardVariant, CollectionItem } from "@/types/api/cards";

function CardDate({ timestamp }: { timestamp: number }) {
  const { locale } = useI18n();
  const relative = formatCardRelativeDate(timestamp, locale);
  const exact = formatCardDate(timestamp, locale);
  if (relative === "" || exact === "") return <span>-</span>;
  return (
    <time
      dateTime={new Date(timestamp * 1000).toISOString()}
      title={exact}
      className="cards-detail-date"
    >
      {relative}
    </time>
  );
}

export default function CardFacts({
  card,
  variants,
  source,
  animeId,
  onOpenAnime,
  onVariantChange,
}: {
  card: CollectionItem;
  variants: CollectionItem[];
  source: string;
  animeId: number | null;
  onOpenAnime: (animeId: number) => void;
  onVariantChange: (variant: CardVariant) => void;
}) {
  const { t } = useI18n();
  const title = card.title.trim() === "" ? t("collection.detail.unknown.title") : card.title;
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
        {animeId === null ? (
          <p className="cards-detail-source">{source}</p>
        ) : (
          <button
            type="button"
            className="cards-detail-source cards-detail-source-link"
            onClick={() => onOpenAnime(animeId)}
            title={t("collection.detail.open.anime")}
          >
            {source}
          </button>
        )}
      </header>

      {variants.length > 1 && (
        <div className="cards-detail-variant-select">
          <span className="windows95-text text-hint text-xs">{t("collection.detail.variant")}</span>
          <Select
            className="w-40"
            label={t("collection.detail.variant")}
            value={card.variant}
            options={variants.map((entry) => ({
              value: entry.variant,
              label: t(cardVariantLabelKeys[entry.variant]),
            }))}
            onChange={(value) => onVariantChange(value as CardVariant)}
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
