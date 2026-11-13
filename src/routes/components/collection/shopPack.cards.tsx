import { useCell } from "@hullperse/hp_utils/react";

import { Button } from "@/components/ui/button.component";
import { packLabelKey } from "@/config/cards/labels.config";
import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { ShopPackConfig } from "@/types/api/cards";

import PackArt from "@/routes/components/collection/packArt.cards";

export default function ShopPack({
  pack,
  wallet,
  buying,
  onBuy,
}: {
  pack: ShopPackConfig;
  wallet: number;
  buying: boolean;
  onBuy: () => void;
}) {
  const { t } = useI18n();
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);
  const kindLabel = t(packLabelKey(pack.packKind));
  const missing = Math.max(0, pack.price - wallet);
  const affordable = missing === 0;

  return (
    <article className="cards-shop-pack">
      <div className="cards-shop-art" {...tilt}>
        <PackArt packKind={pack.packKind} size={pack.size} />
      </div>

      <div className="cards-shop-body">
        <header className="cards-shop-pack-head">
          <h3 className="cards-shop-pack-title">{kindLabel}</h3>
          <span
            className="cards-shop-price"
            aria-label={`${t("collection.shop.price")}: ${pack.price}`}
          >
            <img src="/money.png" alt="" className="chubrik-icon" />
            <strong className="tabular-nums">{pack.price}</strong>
          </span>
        </header>

        <Button
          className="cards-shop-buy h-7 w-full px-2 text-xs"
          disabled={!affordable}
          loading={buying}
          title={!affordable ? t("collection.shop.notEnough") : undefined}
          onClick={onBuy}
        >
          {affordable
            ? t("collection.shop.buy")
            : t("collection.shop.short", { amount: missing })}
        </Button>
      </div>
    </article>
  );
}
