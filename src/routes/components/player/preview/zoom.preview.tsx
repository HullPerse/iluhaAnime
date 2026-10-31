import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { PreviewFrame } from "@/types/core/upscale";

export function PreviewZoom({ frame }: { frame: PreviewFrame }) {
  const { t } = useI18n();
  const [showAfter, setShowAfter] = useState<boolean>(true);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <img src={showAfter ? frame.after : frame.before} alt="" className="max-h-[60vh] w-auto" />
      <div className="mt-1 flex flex-row justify-center gap-1">
        <Button onClick={() => setShowAfter(false)} disabled={!showAfter}>
          {t("player.upscale.preview.before")}
        </Button>
        <Button onClick={() => setShowAfter(true)} disabled={showAfter}>
          {t("player.upscale.preview.after")}
        </Button>
      </div>
    </div>
  );
}
