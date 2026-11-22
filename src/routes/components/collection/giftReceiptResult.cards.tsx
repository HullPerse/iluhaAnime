import { Button } from "@/components/ui/button.component";
import { cardKindLabelKeys } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { giftTotals } from "@/lib/cards/gift.utils";
import type { GiftItem } from "@/types/api/cards";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import GiftStacks from "@/routes/components/collection/giftStacks.cards";

export default function GiftReceiptResult({
  gift,
  confirmed,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  gift: GiftItem;
  confirmed: boolean;
  pending: boolean;
  error: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const lead = gift.cards[0] ?? null;
  const title = lead?.title.trim() || t("collection.gift");
  const { copies, value } = giftTotals(gift.cards);

  return (
    <div className="cards-detail cards-gift-receipt">
      <div className="cards-detail-left">
        {lead === null ? <CardBack rarity="rare" /> : <CardFace card={lead} />}
      </div>

      <div className="cards-detail-body">
        <header className="cards-detail-head">
          <span className="cards-detail-kicker">
            {lead === null ? t("collection.gift") : t(cardKindLabelKeys[lead.kind])}
          </span>
          <h2 className="cards-detail-title">{title}</h2>
          {lead?.collectionTitle && <p className="cards-detail-source">{lead.collectionTitle}</p>}
        </header>

        {confirmed ? (
          <>
            <p className="windows95-text text-success m-0" role="status">
              {t("collection.gift.receipt.done")}
            </p>
            <p className="windows95-text text-hint m-0 text-xs">
              {t("collection.gift.receipt.removed")}
            </p>
          </>
        ) : (
          <div className="cards-gift-receipt-note">
            <p className="windows95-text text-text m-0">{t("collection.gift.receipt.confirm")}</p>
            <p className="windows95-text text-hint m-0 text-xs">
              {t("collection.gift.receipt.effect")}
            </p>
          </div>
        )}

        <dl className="cards-detail-grid">
          <div>
            <dt>{t("collection.copies")}</dt>
            <dd className="tabular-nums">{copies}</dd>
          </div>
          <div>
            <dt>{t("collection.value")}</dt>
            <dd className="cards-detail-value">
              <img src="/money.png" alt="" className="chubrik-icon" />
              <span className="tabular-nums">{value}</span>
            </dd>
          </div>
        </dl>

        <GiftStacks cards={gift.cards} />

        {error && (
          <p className="windows95-text text-destructive m-0" role="alert">
            {t("collection.gift.receipt.error")}
          </p>
        )}

        <div className="cards-detail-actions">
          {confirmed ? (
            <Button onClick={onClose}>{t("common.close")}</Button>
          ) : (
            <>
              <Button onClick={onClose}>{t("common.cancel")}</Button>
              <Button loading={pending} onClick={onConfirm}>
                {t("collection.gift.receipt.action")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
