import { useEffect, useRef } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { CardPackRow } from "@/types/api/cards";

import PackOpen from "@/routes/components/collection/packOpen.cards";

export default function OpenCards({ pack, onClose }: { pack: CardPackRow; onClose: () => void }) {
  const { t } = useI18n();
  const mutations = useCardsMutations();
  const { mutate, reset, data, isPending, isError } = mutations.openPack;
  const claim = mutations.claimPack;
  const started = useRef<string | null>(null);
  const preparing = data?.preparing === true;
  const preparingFailed = preparing && pack.contentsState === "failed";
  const close = () => {
    if (pack.packKind !== "choice") mutations.invalidate();
    onClose();
  };

  const choose = (slot: number) => claim.mutate({ packId: pack.id, slot });

  useEffect(() => {
    if (started.current === pack.id) return;
    started.current = pack.id;
    mutate(pack.id);
  }, [mutate, pack.id]);

  useEffect(() => {
    if (!preparing || pack.contentsState !== "ready") return;
    mutate(pack.id);
  }, [preparing, mutate, pack.contentsState, pack.id]);

  const retry = () => {
    reset();
    claim.reset();
    mutate(pack.id);
  };

  if (data !== undefined) {
    return (
      <PackOpen
        cards={data.cards}
        packKind={pack.packKind}
        value={claim.data?.value ?? data.value}
        chosenSlot={claim.data?.chosenSlot ?? data.chosenSlot}
        claiming={claim.isPending}
        choiceError={claim.isError}
        onChoose={pack.packKind === "choice" ? choose : undefined}
        onClose={close}
      />
    );
  }

  return (
    <Modal
      header={t("collection.open.title")}
      onClose={close}
      canClose={() => isError || preparing}
      className="w-[min(64rem,calc(100vw-1rem))]"
    >
      {isPending && <TabLoader className="min-h-48 w-full" />}
      {preparing && !preparingFailed && (
        <div className="flex flex-col items-center gap-2 p-4">
          <TabLoader className="min-h-32 w-full" />
          <span className="windows95-text text-hint text-center" role="status">
            {t("collection.game.state.pending")}
          </span>
        </div>
      )}
      {preparingFailed && (
        <span className="windows95-text text-destructive p-4 text-center" role="alert">
          {t("collection.open.error")}
        </span>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-2 p-4">
          <span className="windows95-text text-destructive text-center" role="alert">
            {t("collection.open.error")}
          </span>
          <Button onClick={retry}>{t("collection.retry")}</Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button disabled={!isError && !preparing} onClick={close}>
          {t("common.close")}
        </Button>
      </div>
    </Modal>
  );
}
