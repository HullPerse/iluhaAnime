import { useEffect, useRef } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useCardsPacks } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";

export default function PreparePacksDialog({
  autoStart = false,
  onClose,
}: {
  autoStart?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const packs = useCardsPacks();
  const { mutate: runPreparation, isPending, isError } = useCardsMutations().preparePacks;
  const rows = (packs.data ?? []).filter((pack) => pack.openedAt === null);
  const ready = rows.filter((pack) => pack.contentsState === "ready").length;
  const pending = rows.filter((pack) => pack.contentsState === "pending").length;
  const failed = rows.filter((pack) => pack.contentsState === "failed").length;
  const queued = pending + failed;
  const total = rows.length;
  const percent = total === 0 ? 100 : Math.round((ready / total) * 100);
  const started = useRef<boolean>(false);
  const lastReady = useRef(ready);

  useEffect(() => {
    if (!autoStart || started.current || queued === 0) return;

    started.current = true;

    lastReady.current = ready;

    if (!isPending) runPreparation(false);
  }, [autoStart, isPending, queued, ready, runPreparation, lastReady, started]);

  useEffect(() => {
    if (
      !started.current ||
      isPending ||
      packs.isFetching ||
      pending === 0 ||
      ready <= lastReady.current
    )
      return;
    lastReady.current = ready;
    runPreparation(false);
  }, [isPending, packs.isFetching, pending, ready, runPreparation, lastReady, started]);

  const start = () => {
    started.current = true;
    lastReady.current = ready;

    if (!isPending) runPreparation(true);
  };

  return (
    <Modal
      header={t("collection.packs.prepare.title")}
      onClose={onClose}
      className="w-[min(34rem,calc(100vw-1rem))]"
    >
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label={t("collection.packs.prepare.progress", { ready, total })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="windows95-border bg-field h-4 w-full overflow-hidden"
        >
          <div
            className="bg-success h-full transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="windows95-text flex flex-col gap-1 text-xs">
          <span>{t("collection.packs.prepare.progress", { ready, total })}</span>
          <span>{t("collection.packs.prepare.queued", { count: queued })}</span>
          {failed > 0 && (
            <span className="text-destructive">
              {t("collection.packs.prepare.failed", { count: failed })}
            </span>
          )}
        </div>
        <p className="windows95-text text-hint text-xs">
          {isPending
            ? t("collection.packs.prepare.hint")
            : queued > 0
              ? t("collection.packs.prepare.startHint")
              : t("collection.packs.prepare.done")}
        </p>
        {isError && (
          <span className="windows95-text text-destructive text-xs" role="alert">
            {t("collection.packs.prepare.error")}
          </span>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.close")}</Button>
          {queued > 0 && (
            <Button loading={isPending} disabled={isPending} onClick={start}>
              {isPending
                ? t("collection.packs.prepare.running")
                : t("collection.packs.prepare.action")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
