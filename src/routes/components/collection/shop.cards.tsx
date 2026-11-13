import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useCardsBootstrap } from "@/hooks/cards/queries.hook";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";

import ShopPack from "@/routes/components/collection/shopPack.cards";

export default function ShopCards() {
  const { t } = useI18n();
  const bootstrap = useCardsBootstrap();
  const buyPack = useCardsMutations().buyPack;

  if (bootstrap.isPending) return <TabLoader className="min-h-48 flex-1" />;

  if (bootstrap.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.error")}
        </span>
        <Button onClick={() => ignore(bootstrap.refetch())}>{t("collection.retry")}</Button>
      </div>
    );
  }

  const { config, wallet } = bootstrap.data;
  const packs = config.shopPacks;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="cards-shop">
        {buyPack.isError && (
          <p className="windows95-text text-destructive m-0" role="alert">
            {t("collection.shop.error")}
          </p>
        )}

        {packs.length === 0 ? (
          <p className="windows95-text text-hint m-0">{t("collection.shop.empty")}</p>
        ) : (
          <div className="cards-shop-grid">
            {packs.map((pack) => (
              <ShopPack
                key={pack.packKind}
                pack={pack}
                wallet={wallet}
                buying={buyPack.isPending}
                onBuy={() => buyPack.mutate(pack.packKind)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
