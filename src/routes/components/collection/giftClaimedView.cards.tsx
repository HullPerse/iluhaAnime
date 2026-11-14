import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { cardRarityLabelKeys, cardVariantLabelKeys } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { GiftCard } from "@/types/api/cards";

import CardDate from "@/routes/components/collection/cardDate.cards";
import GiftStacks from "@/routes/components/collection/giftStacks.cards";

export default function GiftClaimedView({
  claimed,
  claimedCard,
  receiptLink,
  receiptCopied,
  receiptError,
  onCopyReceipt,
  onClose,
}: {
  claimed: GiftCard[];
  claimedCard: GiftCard | null;
  receiptLink: string;
  receiptCopied: boolean;
  receiptError: boolean;
  onCopyReceipt: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const claimedCopies = claimed.reduce((sum, card) => sum + card.copies, 0);
  const claimedValue = claimed.reduce((sum, card) => sum + card.value * card.copies, 0);

  return (
    <>
      {claimedCard !== null && (
        <dl className="cards-detail-grid">
          <div>
            <dt>{t("collection.detail.rarity")}</dt>
            <dd>{t(cardRarityLabelKeys[claimedCard.rarity])}</dd>
          </div>
          {claimedCard.variant === "normal" ? null : (
            <div>
              <dt>{t("collection.detail.variant")}</dt>
              <dd>{t(cardVariantLabelKeys[claimedCard.variant])}</dd>
            </div>
          )}
          <div>
            <dt>{t("collection.value")}</dt>
            <dd className="cards-detail-value">
              <img src="/money.png" alt="" className="chubrik-icon" />
              <span className="tabular-nums">{claimedValue}</span>
            </dd>
          </div>
          <div>
            <dt>{t("collection.copies")}</dt>
            <dd className="tabular-nums">{claimedCopies}</dd>
          </div>
          <div>
            <dt>{t("collection.detail.first")}</dt>
            <dd>
              <CardDate timestamp={claimedCard.firstObtainedAt} />
            </dd>
          </div>
          <div>
            <dt>{t("collection.detail.last")}</dt>
            <dd>
              <CardDate timestamp={claimedCard.lastObtainedAt} />
            </dd>
          </div>
        </dl>
      )}

      {claimed.length > 0 && <GiftStacks cards={claimed} />}

      <div className="cards-gift-detail-receipt">
        <p className="windows95-text text-hint m-0 text-xs">{t("collection.gift.receipt.hint")}</p>
        <div className="flex items-center gap-1">
          <Input
            className="text-text windows95-text min-w-0 flex-1 px-1 py-0.5"
            value={receiptLink}
            readOnly
            aria-label={t("collection.gift.receipt.link")}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button className="h-7 px-2 text-xs" onClick={onCopyReceipt}>
            {t("collection.gift.copy")}
          </Button>
        </div>
        {receiptCopied && (
          <span className="windows95-text text-success" role="status">
            {t("collection.gift.receipt.copied")}
          </span>
        )}
        {receiptError && (
          <span className="windows95-text text-destructive" role="alert">
            {t("collection.gift.copy.error")}
          </span>
        )}
      </div>

      <div className="cards-detail-actions">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
    </>
  );
}
