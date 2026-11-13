import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { buildCardGiftLink, cardGiftPreview } from "@/lib/cards/gift.utils";
import type { GiftItem } from "@/types/api/cards";

import CardFace from "@/routes/components/collection/cardFace.cards";
import CopyLinkButton from "@/routes/components/collection/copyLinkButton.cards";

export interface GiftCardProps {
  gift: GiftItem;
  deleting: boolean;
  copyError: boolean;
  onDelete: () => void;
  onCopyError: (giftId: string | null) => void;
}

function giftLink(gift: GiftItem): string {
  const lead = gift.cards[0];
  if (!lead) return "";
  return buildCardGiftLink({
    giftId: gift.id,
    kind: lead.kind,
    entityId: lead.entityId,
    preview: cardGiftPreview(lead),
    cards: gift.cards.map((card) => ({
      rarity: card.rarity,
      variant: card.variant,
      copies: card.copies,
      value: card.value,
      firstObtainedAt: card.firstObtainedAt,
      lastObtainedAt: card.lastObtainedAt,
    })),
  });
}

export default function GiftCard({
  gift,
  deleting,
  copyError,
  onDelete,
  onCopyError,
}: GiftCardProps) {
  const { t } = useI18n();
  const lead = gift.cards[0];
  if (!lead) return null;

  const link = giftLink(gift);

  return (
    <article className="cards-gift-item" aria-label={lead.title}>
      <div className="cards-gift-item-row">
        <div className="cards-gift-cardface">
          <CardFace card={lead} />
          {gift.totalCopies > 1 && (
            <span
              className="cards-gift-copies windows95-active-border bg-primary windows95-text font-bold"
              title={`${t("collection.copies")}: ${gift.totalCopies}`}
              aria-label={`${t("collection.copies")}: ${gift.totalCopies}`}
            >
              ×{gift.totalCopies}
            </span>
          )}
        </div>

        <div className="cards-gift-actions">
          <CopyLinkButton
            value={link}
            disabled={link === ""}
            className="size-8"
            onCopied={() => onCopyError(null)}
            onError={() => onCopyError(gift.id)}
          />
          <Button
            variant="destructive"
            size="icon"
            className="size-8"
            title={t("collection.gifts.delete")}
            aria-label={t("collection.gifts.delete")}
            loading={deleting}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {copyError && (
        <p className="windows95-text text-destructive m-0" role="alert">
          {t("collection.gift.copy.error")}
        </p>
      )}
    </article>
  );
}
