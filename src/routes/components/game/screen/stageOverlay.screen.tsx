import { TriangleAlert } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { GameSessionStatus } from "@/types/core/gameSession";

export function StageOverlay({
  status,
  error,
  onRetry,
}: {
  status: GameSessionStatus;
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  if (status === "running") return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
      {status === "starting" && (
        <>
          <SmallLoader size={8} />
          <span className="text-hint text-xs">{t("game.status.starting")}</span>
        </>
      )}
      {status === "error" && (
        <>
          <TriangleAlert aria-hidden className="text-destructive size-8" />
          <span className="text-destructive text-xs font-bold">{t("game.stage.error")}</span>
          {error !== null && <span className="text-hint max-w-md text-xs">{error}</span>}
          <Button className="pointer-events-auto" onClick={onRetry}>
            {t("game.retry")}
          </Button>
        </>
      )}
    </div>
  );
}
