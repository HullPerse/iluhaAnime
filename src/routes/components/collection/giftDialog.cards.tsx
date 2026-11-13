import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import {
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
} from "@/config/cards/labels.config";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { buildCardGiftReceiptLink } from "@/lib/cards/gift.utils";
import type { CardGiftDeepLink } from "@/types/core/deeplink";
import type { OpenedCard } from "@/types/api/cards";

import CardFace from "@/routes/components/collection/cardFace.cards";

export default function GiftDialog({
  gift,
  onClose,
}: {
  gift: CardGiftDeepLink;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const claim = useCardsMutations().claimGift;
  const [claimed, setClaimed] = useState<OpenedCard | null>(null);
  const [receiptCopied, setReceiptCopied] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<boolean>(false);
  const receiptLink = buildCardGiftReceiptLink(gift.giftId);

  const copyReceipt = async () => {
    try {
      await writeText(receiptLink);
      setReceiptCopied(true);
      setReceiptError(false);
    } catch {
      setReceiptCopied(false);
      setReceiptError(true);
    }
  };

  return (
    <Modal header={t("collection.gift")} onClose={onClose} className="w-[min(40rem,calc(100vw-1rem))]">
      {claimed === null ? (
        <div className="flex w-full flex-col gap-2">
          <p className="windows95-text text-hint m-0">{t("collection.gift.local")}</p>
          <dl className="windows95-text grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-hint">{t("collection.kind")}</dt>
            <dd className="m-0">{t(cardKindLabelKeys[gift.kind])}</dd>
            <dt className="text-hint">{t("collection.rarity")}</dt>
            <dd className="m-0">{t(cardRarityLabelKeys[gift.rarity])}</dd>
            <dt className="text-hint">{t("collection.variant")}</dt>
            <dd className="m-0">{t(cardVariantLabelKeys[gift.variant])}</dd>
            {gift.value === null ? null : (
              <>
                <dt className="text-hint">{t("collection.value")}</dt>
                <dd className="m-0 tabular-nums">{gift.value}</dd>
              </>
            )}
          </dl>
          {claim.isError && (
            <p className="windows95-text text-destructive m-0" role="alert">
              {t("collection.gift.claim.error")}
            </p>
          )}
          <div className="flex justify-end gap-1">
            <Button className="h-6 px-2 text-xs" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              className="h-6 px-2 text-xs"
              loading={claim.isPending}
              onClick={() =>
                claim.mutate(
                  {
                    giftId: gift.giftId,
                    kind: gift.kind,
                    entityId: gift.entityId,
                    rarity: gift.rarity,
                    variant: gift.variant,
                    value: gift.value,
                  },
                  { onSuccess: setClaimed }
                )
              }
            >
              {t("collection.gift.claim")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <p className="windows95-text text-success m-0" role="status">
            {t("collection.gift.claimed")}
          </p>
          <div className="w-40 self-center">
            <CardFace card={claimed} />
          </div>
          <p className="windows95-text text-center font-bold">{claimed.title}</p>
          <p className="windows95-text text-hint m-0">{t("collection.gift.receipt.hint")}</p>
          <div className="flex items-center gap-1">
            <input
              className="windows95-border bg-primary text-text windows95-text min-w-0 flex-1 px-1 py-0.5"
              value={receiptLink}
              readOnly
              aria-label={t("collection.gift.receipt.link")}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button className="h-6 px-2 text-xs" onClick={copyReceipt}>
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
          <div className="flex justify-end">
            <Button className="h-6 px-2 text-xs" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
