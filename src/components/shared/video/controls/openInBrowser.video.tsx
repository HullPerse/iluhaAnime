import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";

import { Win95PlayerButton } from "./win95PlayerButton.video";

export function OpenInBrowserButton({ youtubeId }: { youtubeId: string }) {
  const { t } = useI18n();
  const onClick = () => {
    (async () => {
      const [, error] = await attempt(openUrl(`https://www.youtube.com/watch?v=${youtubeId}`));
      if (error) showError(t("common.error"), error.message);
    })();
  };
  return (
    <Win95PlayerButton
      onClick={onClick}
      aria-label={t("player.video.open.browser")}
      title={t("player.video.open.browser")}
    >
      <ExternalLink className="size-3" />
    </Win95PlayerButton>
  );
}
