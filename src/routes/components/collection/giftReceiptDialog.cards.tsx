import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { CardGiftReceiptDeepLink } from "@/types/core/deeplink";
import type { GiftItem } from "@/types/api/cards";

import CardFace from "@/routes/components/collection/cardFace.cards";

export default function GiftReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: CardGiftReceiptDeepLink;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const markClaimed = useCardsMutations().markGiftClaimed;
  const [gift, setGift] = useState<GiftItem | null>(null);

  return (
    <Modal
      header={t("collection.gift.receipt.title")}
      onClose={onClose}
      className="w-[min(36rem,calc(100vw-1rem))]"
    >
      {gift === null ? (
        <div className="flex w-full flex-col gap-2">
          <p className="windows95-text text-hint m-0">{t("collection.gift.receipt.confirm")}</p>
          {markClaimed.isError && (
            <p className="windows95-text text-destructive m-0" role="alert">
              {t("collection.gift.receipt.error")}
            </p>
          )}
          <div className="flex justify-end gap-1">
            <Button className="h-6 px-2 text-xs" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              className="h-6 px-2 text-xs"
              loading={markClaimed.isPending}
              onClick={() =>
                markClaimed.mutate(receipt.giftId, { onSuccess: setGift })
              }
            >
              {t("collection.gift.receipt.action")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <p className="windows95-text text-success m-0" role="status">
            {t("collection.gift.receipt.done")}
          </p>
          <div className="w-40 self-center">
            <CardFace card={gift.card} />
          </div>
          <p className="windows95-text text-center font-bold">{gift.card.title}</p>
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
