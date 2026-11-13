import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useCardsGifts } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { buildCardGiftLink } from "@/lib/cards/gift.utils";
import { formatCardDate } from "@/lib/cards/format.utils";
import type { GiftItem } from "@/types/api/cards";

import CardFace from "@/routes/components/collection/cardFace.cards";

function giftLink(gift: GiftItem): string {
  return buildCardGiftLink({
    giftId: gift.id,
    kind: gift.card.kind,
    entityId: gift.card.entityId,
    rarity: gift.card.rarity,
    variant: gift.card.variant,
    value: gift.card.value,
  });
}

export default function GiftsCards() {
  const { t, locale } = useI18n();
  const gifts = useCardsGifts();
  const mutations = useCardsMutations();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const copy = async (gift: GiftItem) => {
    try {
      await writeText(giftLink(gift));
      setCopiedId(gift.id);
      setCopyErrorId(null);
    } catch {
      setCopiedId(null);
      setCopyErrorId(gift.id);
    }
  };

  if (gifts.isPending) {
    return <TabLoader className="min-h-48" />;
  }

  if (gifts.isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.gifts.error")}
        </span>
        <Button onClick={() => gifts.refetch()}>{t("collection.retry")}</Button>
      </div>
    );
  }

  const items = gifts.data ?? [];
  if (items.length === 0) {
    return <p className="windows95-text text-hint p-2">{t("collection.gifts.empty")}</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-1">
      <p className="windows95-text text-hint m-0">{t("collection.gifts.hint")}</p>
      {notice !== "" && (
        <p className="windows95-text text-success m-0" role="status">
          {notice}
        </p>
      )}
      {mutations.deleteGift.isError && (
        <p className="windows95-text text-destructive m-0" role="alert">
          {t("collection.gifts.delete.error")}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
        {items.map((gift) => {
          const claimed = gift.claimedAt !== null;
          return (
            <article
              key={gift.id}
              className="windows95-border bg-field flex min-w-0 flex-col gap-1 p-1"
            >
              <div className="mx-auto w-36">
                <CardFace card={gift.card} />
              </div>
              <p className="windows95-text m-0 truncate text-center font-bold" title={gift.card.title}>
                {gift.card.title}
              </p>
              <p className="windows95-text text-hint m-0 text-center text-xs">
                {claimed
                  ? t("collection.gifts.status.claimed")
                  : t("collection.gifts.status.pending")}
              </p>
              <p className="windows95-text text-hint m-0 text-center text-xs">
                {formatCardDate(gift.createdAt, locale)}
              </p>
              <div className="mt-auto flex flex-col gap-1">
                <Button className="h-6 px-2 text-xs" onClick={() => copy(gift)}>
                  {copiedId === gift.id
                    ? t("collection.gift.copied")
                    : t("collection.gift.copy")}
                </Button>
                {copyErrorId === gift.id && (
                  <span className="windows95-text text-destructive text-center" role="alert">
                    {t("collection.gift.copy.error")}
                  </span>
                )}
                <Button
                  variant="destructive"
                  className="h-6 px-2 text-xs"
                  loading={mutations.deleteGift.isPending}
                  onClick={() =>
                    mutations.deleteGift.mutate(gift.id, {
                      onSuccess: (result) => {
                        setNotice(
                          result.returned
                            ? t("collection.gifts.deleted.returned")
                            : t("collection.gifts.deleted.claimed")
                        );
                      },
                    })
                  }
                >
                  {t("collection.gifts.delete")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
