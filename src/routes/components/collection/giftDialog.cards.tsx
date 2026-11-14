import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { attempt } from "@hullperse/hp_utils/attempt";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { displayCard, giftSource } from "@/lib/cards/giftDisplay.utils";
import { buildCardGiftReceiptLink } from "@/lib/cards/gift.utils";
import type { GiftCard } from "@/types/api/cards";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import CardSpin from "@/routes/components/collection/cardSpin.cards";
import GiftClaimedView from "@/routes/components/collection/giftClaimedView.cards";
import GiftClaimForm from "@/routes/components/collection/giftClaimForm.cards";
import GiftHeader from "@/routes/components/collection/giftHeader.cards";

export default function GiftDialog({
  gift,
  onClose,
}: {
  gift: CardGiftDeepLink;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const claim = useCardsMutations().claimGift;
  const [claimed, setClaimed] = useState<GiftCard[] | null>(null);
  const [receiptCopied, setReceiptCopied] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<boolean>(false);
  const receiptLink = buildCardGiftReceiptLink(gift.giftId);
  const claimedCard = claimed?.[0] ?? null;
  const shownCard = displayCard(gift, claimedCard);

  const copyReceipt = async () => {
    const [, error] = await attempt(writeText(receiptLink));
    setReceiptCopied(error === null);
    setReceiptError(error !== null);
  };

  return (
    <Modal
      header={t("collection.gift")}
      onClose={onClose}
      className="w-[min(56rem,calc(100vw-1rem))]"
      contentClassName="p-0"
    >
      <div className="cards-detail cards-gift-detail">
        <div className="cards-detail-left">
          <CardSpin
            front={
              shownCard === null ? (
                <CardBack rarity={gift.cards[0]?.rarity ?? "common"} />
              ) : (
                <CardFace card={shownCard} tilt="restrained" />
              )
            }
            back={<CardBack rarity={shownCard?.rarity ?? gift.cards[0]?.rarity ?? "common"} />}
          />
        </div>

        <div className="cards-detail-body">
          <GiftHeader
            gift={gift}
            claimed={claimed}
            card={shownCard}
            source={giftSource(gift, claimed, claimedCard)}
          />

          {claimed === null ? (
            <GiftClaimForm
              gift={gift}
              claiming={claim.isPending}
              claimError={claim.isError}
              onClose={onClose}
              onClaim={() =>
                claim.mutate(
                  {
                    giftId: gift.giftId,
                    kind: gift.kind,
                    entityId: gift.entityId,
                    cards: gift.cards,
                  },
                  { onSuccess: setClaimed }
                )
              }
            />
          ) : (
            <GiftClaimedView
              claimed={claimed}
              claimedCard={claimedCard}
              receiptLink={receiptLink}
              receiptCopied={receiptCopied}
              receiptError={receiptError}
              onCopyReceipt={copyReceipt}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
