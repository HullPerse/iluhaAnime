import { useCell } from "@hullperse/hp_utils/react";
import { useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useCardsGifts } from "@/hooks/cards/queries.hook";
import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsAtoms } from "@/store/settings.store";

import GiftCard from "@/routes/components/collection/giftCard.cards";

export default function GiftsCards() {
  const { t } = useI18n();
  const gifts = useCardsGifts();
  const mutations = useCardsMutations();
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

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
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="windows95-text text-hint m-0">{t("collection.gifts.empty")}</p>
      </div>
    );
  }

  return (
    <div className="cards-gifts">
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

      <div className="cards-gifts-list" {...tilt}>
        {items.map((gift) => (
          <GiftCard
            key={gift.id}
            gift={gift}
            deleting={mutations.deleteGift.isPending}
            copyError={copyErrorId === gift.id}
            onCopyError={setCopyErrorId}
            onDelete={() =>
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
          />
        ))}
      </div>
    </div>
  );
}
