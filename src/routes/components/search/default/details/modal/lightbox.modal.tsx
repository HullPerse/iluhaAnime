import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError } from "@/lib/core/attempt.utils";

export function DetailsLightbox({ url }: { url: string }) {
  const { t } = useI18n();
  const openImage = async () => {
    const [, openError] = await attempt(openUrl(url));
    if (openError) reportBackgroundError("details.open-image", openError);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex justify-end">
        <Button onClick={() => openImage()}>
          <ExternalLink className="size-3" />
          {t("search.details.open.image")}
        </Button>
      </div>
      <div className="windows95-border h-[62vh] overflow-auto bg-black/20">
        <ImageComponent key={url} src={url} alt="" className="h-full w-full" type="contain" />
      </div>
    </div>
  );
}
