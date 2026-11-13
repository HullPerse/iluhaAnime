import { useCell } from "@hullperse/hp_utils/react";

import { Button } from "@/components/ui/button.component";
import { cardSourceLabelKey, packLabelKey } from "@/config/cards/labels.config";
import { useCardTilt } from "@/hooks/cards/tilt.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";
import { cardsAtoms } from "@/store/cards.store";
import { settingsAtoms } from "@/store/settings.store";
import type { CardPackRow } from "@/types/api/cards";

import PackArt from "@/routes/components/collection/packArt.cards";

export default function PacksRowCards({
  pack,
  onOpen,
}: {
  pack: CardPackRow;
  onOpen: (pack: CardPackRow) => void;
}) {
  const { t, locale } = useI18n();
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);
  const newSince = useCell(cardsAtoms.packsNewSince);
  const created = formatCardRelativeDate(pack.createdAt, locale);
  const exactCreated = formatCardDate(pack.createdAt, locale);

  return (
    <article className="windows95-border bg-field relative flex h-full min-w-0 flex-col gap-1 p-2">
      <div className="cards-pack-tilt mx-auto mb-1 w-full max-w-[9.5rem]" {...tilt}>
        <PackArt packKind={pack.packKind} size={pack.size} />
      </div>
      {pack.createdAt > newSince && (
        <span className="cards-new-stamp" data-testid="pack-new">
          {t("collection.card.new")}
        </span>
      )}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h3 className="windows95-text min-w-0 truncate font-bold">{t(packLabelKey(pack.packKind))}</h3>
        <span className="windows95-text text-hint shrink-0 text-xs">
          {t(cardSourceLabelKey(pack.source))}
        </span>
      </div>
      <span className="windows95-text text-hint">
        {t("collection.packs.size", { size: pack.size })}
      </span>
      {created !== "" && (
        <time
          dateTime={new Date(pack.createdAt * 1000).toISOString()}
          title={exactCreated}
          className="windows95-text text-hint cursor-help"
        >
          {t("collection.packs.created", { date: created })}
        </time>
      )}
      <Button className="mt-auto h-6 w-full px-2 text-xs" onClick={() => onOpen(pack)}>
        {t("collection.open")}
      </Button>
    </article>
  );
}
