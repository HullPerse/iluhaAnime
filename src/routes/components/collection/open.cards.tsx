import { useEffect, useRef } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { CardPackRow } from "@/types/api/cards";

import PackOpen from "@/routes/components/collection/packOpen.cards";

export default function OpenCards({
  pack,
  onClose,
}: {
  pack: CardPackRow;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const mutations = useCardsMutations();
  const { mutate, reset, data, isPending, isError } = mutations.openPack;
  const started = useRef<string | null>(null);
  const close = () => {
    mutations.invalidate();
    onClose();
  };

  useEffect(() => {
    if (started.current === pack.id) return;
    started.current = pack.id;
    mutate(pack.id);
  }, [mutate, pack.id]);

  const retry = () => {
    reset();
    mutate(pack.id);
  };

  if (data !== undefined) {
    return (
      <PackOpen
        cards={data.cards}
        packKind={pack.packKind}
        value={data.value}
        onClose={close}
      />
    );
  }

  return (
    <Modal
      header={t("collection.open.title")}
      onClose={onClose}
      className="w-[min(64rem,calc(100vw-1rem))]"
    >
      {isPending && <TabLoader className="min-h-48 w-full" />}
      {isError && (
        <div className="flex flex-col items-center gap-2 p-4">
          <span className="windows95-text text-destructive text-center" role="alert">
            {t("collection.open.error")}
          </span>
          <Button onClick={retry}>{t("collection.retry")}</Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={close}>{t("common.close")}</Button>
      </div>
    </Modal>
  );
}
