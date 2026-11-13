import { useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useCardsPacks } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { CardPackRow } from "@/types/api/cards";

import OpenCards from "@/routes/components/collection/open.cards";
import PacksRowCards from "@/routes/components/collection/packsRow.cards";

export default function PacksCards() {
  const { t } = useI18n();
  const packs = useCardsPacks();
  const [selected, setSelected] = useState<CardPackRow | null>(null);

  if (packs.isPending) return <TabLoader className="min-h-48 flex-1" />;

  if (packs.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.error")}
        </span>
        <Button onClick={() => ignore(packs.refetch())}>{t("collection.retry")}</Button>
      </div>
    );
  }

  const unopened = (packs.data ?? []).filter((pack) => pack.openedAt === null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {unopened.length === 0 && (
        <p className="windows95-text text-hint m-0">{t("collection.packs.empty")}</p>
      )}
      {unopened.length > 0 && (
        <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] items-stretch gap-2">
          {unopened.map((pack) => (
            <PacksRowCards key={pack.id} pack={pack} onOpen={setSelected} />
          ))}
        </div>
      )}
      {selected !== null && (
        <OpenCards pack={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
