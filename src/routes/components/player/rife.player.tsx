import { Download } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useUpscaleToolStatus } from "@/hooks/player/toolStatus.hook";

export function RIFE() {
  const { t } = useI18n();
  const { status, percent, dlError, download } = useUpscaleToolStatus("rife");

  if (status === "checking") {
    return (
      <div className="flex flex-col gap-1">
        <SmallLoader size={3} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {status === "ok" && (
        <span className="windows95-text text-xs">{t("player.rife.installed")}</span>
      )}
      {status === "missing" && (
        <>
          <span className="windows95-text text-xs">{t("player.rife.missing")}</span>
          <Button onClick={download}>
            <Download className="size-3" />
            {t("player.rife.download")}
          </Button>
        </>
      )}
      {status === "downloading" && (
        <Button onClick={download} disabled>
          <Download className="size-3" />
          {percent !== null ? t("player.rife.downloading", { percent }) : t("player.rife.download")}
        </Button>
      )}
      {dlError && <span className="text-destructive text-xs">{dlError}</span>}
    </div>
  );
}
