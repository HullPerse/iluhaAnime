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
import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";
import type { GiftCard } from "@/types/api/cards";
import type { CardGiftDeepLink, CardGiftPreview } from "@/types/core/deeplink";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import type { CardFaceItem } from "@/routes/components/collection/cardFace.cards";
import CardSpin from "@/routes/components/collection/cardSpin.cards";
import GiftStacks from "@/routes/components/collection/giftStacks.cards";
import { Input } from "@/components/ui/input.component";

function giftPreviewCard(gift: CardGiftDeepLink): CardFaceItem | null {
  const preview = gift.preview;
  const stack = gift.cards[0];
  if (preview === undefined || stack === undefined) return null;
  return {
    kind: gift.kind,
    entityId: gift.entityId,
    title: preview.title,
    imageUrl: preview.imageUrl,
    collage: preview.collage,
    rarity: stack.rarity,
    variant: stack.variant,
    value: stack.value,
  };
}

function claimedDisplayCard(card: GiftCard, preview: CardGiftPreview | undefined): CardFaceItem {
  const fallbackTitle = `${card.kind} #${card.entityId}`;
  const titleMissing = card.title.trim() === "" || card.title === fallbackTitle;
  return {
    ...card,
    title: titleMissing ? (preview?.title ?? card.title) : card.title,
    imageUrl: card.imageUrl ?? preview?.imageUrl ?? null,
    collage: card.collage.length > 0 ? card.collage : (preview?.collage ?? []),
  };
}

function displayCard(gift: CardGiftDeepLink, claimedCard: GiftCard | null): CardFaceItem | null {
  return claimedCard === null
    ? giftPreviewCard(gift)
    : claimedDisplayCard(claimedCard, gift.preview);
}

function giftSource(
  gift: CardGiftDeepLink,
  claimed: GiftCard[] | null,
  card: GiftCard | null
): string {
  const previewSource = gift.preview?.collectionTitle?.trim() ?? "";
  if (claimed === null) return previewSource;
  return card?.collectionTitle?.trim() || previewSource;
}

function GiftHeader({
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

function GiftClaimForm({
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
  const totalCopies = gift.cards.reduce((sum, card) => sum + card.copies, 0);
  const totalValue = gift.cards.reduce((sum, card) => sum + card.value * card.copies, 0);

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

function GiftClaimedView({
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
