import { cardKindLabelKeys } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { GiftCard } from "@/types/api/cards";
import type { CardGiftDeepLink } from "@/types/core/deeplink";
import type { CardFaceItem } from "@/types/ui/collection";

export default function GiftHeader({
  gift,
  claimed,
  card,
  source,
}: {
  gift: CardGiftDeepLink;
  claimed: GiftCard[] | null;
  card: CardFaceItem | null;
  source: string;
}) {
  const { t } = useI18n();
  const kind = card?.kind ?? gift.kind;
  const title = card?.title.trim() || t("collection.gift");

  return (
    <header className="cards-detail-head">
      <span className="cards-detail-kicker">{t(cardKindLabelKeys[kind])}</span>
      <h2 className="cards-detail-title">{title}</h2>
      {source !== "" ? (
        <p className="cards-detail-source">{source}</p>
      ) : claimed === null ? (
        <p className="cards-detail-source">{t("collection.gift.local")}</p>
      ) : null}
      {claimed !== null && (
        <p className="windows95-text text-success m-0" role="status">
          {t("collection.gift.claimed")}
        </p>
      )}
    </header>
  );
}
