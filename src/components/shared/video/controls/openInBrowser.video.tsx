import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

import { useI18n } from "@/lib/locale/i18n.utils";

import { Win95PlayerButton } from "./win95PlayerButton.video";

export function OpenInBrowserButton({ youtubeId }: { youtubeId: string }) {
  const { t } = useI18n();
  const onClick = () => {
    try {
      Promise.resolve(openUrl(`https://www.youtube.com/watch?v=${youtubeId}`)).catch(
        () => undefined
      );
    } catch {}
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
