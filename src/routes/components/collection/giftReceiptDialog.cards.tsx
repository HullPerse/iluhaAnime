import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { cardKindLabelKeys } from "@/config/cards/labels.config";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useCardsGifts } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { GiftItem } from "@/types/api/cards";
import type { CardGiftReceiptDeepLink } from "@/types/core/deeplink";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import GiftStacks from "@/routes/components/collection/giftStacks.cards";

function totalCopies(cards: GiftItem["cards"]): number {
  return cards.reduce((sum, card) => sum + card.copies, 0);
}

function totalValue(cards: GiftItem["cards"]): number {
  return cards.reduce((sum, card) => sum + card.value * card.copies, 0);
}

function ReceiptResult({
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
            <dd className="tabular-nums">{totalCopies(gift.cards)}</dd>
          </div>
          <div>
            <dt>{t("collection.value")}</dt>
            <dd className="cards-detail-value">
              <img src="/money.png" alt="" className="chubrik-icon" />
              <span className="tabular-nums">{totalValue(gift.cards)}</span>
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

export default function GiftReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: CardGiftReceiptDeepLink;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const markClaimed = useCardsMutations().markGiftClaimed;
  const gifts = useCardsGifts();
  const [confirmedGift, setConfirmedGift] = useState<GiftItem | null>(null);
  const outboxGift = gifts.data?.find((gift) => gift.id === receipt.giftId) ?? null;
  const gift = confirmedGift ?? outboxGift;

  return (
    <Modal
      header={t("collection.gift.receipt.title")}
      onClose={onClose}
      className="w-[min(50rem,calc(100vw-1rem))]"
      contentClassName="p-0"
    >
      {gift === null ? (
        <div className="flex w-full flex-col gap-2 p-2">
          <p className="windows95-text text-hint m-0">{t("collection.gift.receipt.confirm")}</p>
          <p className="windows95-text text-hint m-0 text-xs">
            {t("collection.gift.receipt.effect")}
          </p>
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
              onClick={() => markClaimed.mutate(receipt.giftId, { onSuccess: setConfirmedGift })}
            >
              {t("collection.gift.receipt.action")}
            </Button>
          </div>
        </div>
      ) : (
        <ReceiptResult
          gift={gift}
          confirmed={confirmedGift !== null}
          pending={markClaimed.isPending}
          error={markClaimed.isError}
          onConfirm={() => markClaimed.mutate(receipt.giftId, { onSuccess: setConfirmedGift })}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
