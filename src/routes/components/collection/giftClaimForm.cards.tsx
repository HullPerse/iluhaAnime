import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { giftTotals } from "@/lib/cards/gift.utils";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

import GiftStacks from "@/routes/components/collection/giftStacks.cards";

export default function GiftClaimForm({
  gift,
  claiming,
  claimError,
  onClaim,
  onClose,
}: {
  gift: CardGiftDeepLink;
  claiming: boolean;
  claimError: boolean;
  onClaim: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { copies: totalCopies, value: totalValue } = giftTotals(gift.cards);

  return (
    <>
      <dl className="cards-detail-grid">
        <div>
          <dt>{t("collection.copies")}</dt>
          <dd className="tabular-nums">{totalCopies}</dd>
        </div>
        <div>
          <dt>{t("collection.value")}</dt>
          <dd className="cards-detail-value">
            <img src="/money.png" alt="" className="chubrik-icon" />
            <span className="tabular-nums">{totalValue}</span>
          </dd>
        </div>
      </dl>

      <GiftStacks cards={gift.cards} />

      {claimError && (
        <p className="windows95-text text-destructive m-0" role="alert">
          {t("collection.gift.claim.error")}
        </p>
      )}

      <div className="cards-detail-actions">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button loading={claiming} onClick={onClaim}>
          {t("collection.gift.claim")}
        </Button>
      </div>
    </>
  );
}
