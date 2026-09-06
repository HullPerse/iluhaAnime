import { Check } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { UpscaleQueueItem } from "@/types";

export function UpscaleStatusPanels({
  localError,
  activeItem,
  onClose,
}: {
  localError: string | null;
  activeItem: UpscaleQueueItem | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (localError && !activeItem) {
    return (
      <div className="flex flex-col items-center gap-2 p-1">
        <span className="text-destructive windows95-text text-center text-xs">{localError}</span>
        <Button onClick={onClose}>{t("player.common.close")}</Button>
      </div>
    );
  }
  if (activeItem?.status === "error") {
    return (
      <div className="flex flex-col items-center gap-2 p-1">
        <span className="text-destructive windows95-text text-center text-xs">
          {activeItem.error ?? t("common.error")}
        </span>
        <Button onClick={onClose}>{t("player.common.close")}</Button>
      </div>
    );
  }
  if (activeItem?.status === "done") {
    return (
      <div className="flex flex-col items-center gap-2 p-1">
        <Check className="text-success size-6" />
        <span className="windows95-text text-xs">{t("player.upscale.done")}</span>
        <Button onClick={onClose}>{t("player.common.close")}</Button>
      </div>
    );
  }
  return null;
}
