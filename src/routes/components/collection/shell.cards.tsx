import { useCell } from "@hullperse/hp_utils/react";
import { useEffect } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useCardsBootstrap } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import {
  cardsAtoms,
  setCardsAlbumNewSince,
  setCardsAlbumReadAt,
  setCardsPacksNewSince,
  setCardsPacksReadAt,
} from "@/store/cards.store";
import {
  consumeGiftDeepLink,
  consumeGiftReceiptDeepLink,
  deeplinkAtoms,
} from "@/store/deeplink.store";

import AlbumCards from "@/routes/components/collection/album.cards";
import GiftDialog from "@/routes/components/collection/giftDialog.cards";
import GiftReceiptDialog from "@/routes/components/collection/giftReceiptDialog.cards";
import GiftsCards from "@/routes/components/collection/gifts.cards";
import PacksCards from "@/routes/components/collection/packs.cards";
import ShopCards from "@/routes/components/collection/shop.cards";
import TabsCards from "@/routes/components/collection/tabs.cards";

const NEW_BADGE_MS = 5_000;

export default function CollectionShell() {
  const { t } = useI18n();
  const tab = useCell(cardsAtoms.tab);
  const gift = useCell(deeplinkAtoms.giftTarget);
  const giftReceipt = useCell(deeplinkAtoms.giftReceiptTarget);
  const online = useOnlineStatus();
  const bootstrap = useCardsBootstrap();

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    if (tab === "packs") {
      setCardsPacksNewSince(cardsAtoms.packsReadAt.get());
      setCardsPacksReadAt(now);
      setCardsAlbumNewSince(0);
    } else if (tab === "album") {
      setCardsAlbumNewSince(cardsAtoms.albumReadAt.get());
      setCardsAlbumReadAt(now);
      setCardsPacksNewSince(0);
    } else {
      setCardsPacksNewSince(0);
      setCardsAlbumNewSince(0);
      return;
    }
    const timer = window.setTimeout(() => {
      if (tab === "packs") setCardsPacksNewSince(now + 1);
      else setCardsAlbumNewSince(now + 1);
    }, NEW_BADGE_MS);
    return () => window.clearTimeout(timer);
  }, [tab]);

  let body;
  if (bootstrap.isPending) {
    body = <TabLoader className="min-h-48 flex-1" />;
  } else if (bootstrap.isError) {
    body = (
      <section className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.error")}
        </span>
        <Button onClick={() => ignore(bootstrap.refetch())}>{t("collection.retry")}</Button>
      </section>
    );
  } else if (tab === "album") {
    body = <AlbumCards />;
  } else if (tab === "shop") {
    body = <ShopCards />;
  } else if (tab === "gifts") {
    body = <GiftsCards />;
  } else {
    body = <PacksCards />;
  }

  return (
    <div className="flex h-full w-full gap-1 overflow-hidden">
      <aside className="windows95-border bg-field flex w-44 shrink-0 flex-col gap-1 overflow-y-auto p-1">
        <TabsCards />
        <div className="border-muted mt-auto flex flex-col gap-1 border-t pt-1">
          {bootstrap.data && (
            <div
              className="windows95-border bg-primary flex items-center justify-between gap-2 px-2 py-1"
              title={t("collection.wallet")}
              aria-label={`${t("collection.wallet")}: ${bootstrap.data.wallet}`}
            >
              <span className="windows95-text text-hint min-w-0 truncate">
                {t("collection.wallet")}
              </span>
              <span className="windows95-text flex shrink-0 items-center gap-1 font-bold">
                <img src="/money.png" alt="" className="chubrik-icon" />
                <span className="tabular-nums">{bootstrap.data.wallet}</span>
              </span>
            </div>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden">
        {!online && (
          <div className="windows95-border bg-field text-hint windows95-text shrink-0 px-2 py-1">
            {t("collection.offline")}
          </div>
        )}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</section>
      </section>
      {gift !== null && <GiftDialog gift={gift} onClose={consumeGiftDeepLink} />}
      {giftReceipt !== null && (
        <GiftReceiptDialog receipt={giftReceipt} onClose={consumeGiftReceiptDeepLink} />
      )}
    </div>
  );
}
