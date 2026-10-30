import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { reportBackgroundError } from "@/lib/core/attempt.utils";

import { Win95PlayerButton } from "@/components/shared/video/controls/win95PlayerButton.video";

export function FullscreenToggle({
  iframeRef,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === iframeRef.current);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [iframeRef]);

  const toggle = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (fullscreen) {
      document
        .exitFullscreen?.()
        ?.catch((error) => reportBackgroundError("fullscreen.exit", error));
    } else {
      iframe
        .requestFullscreen?.()
        ?.catch((error) => reportBackgroundError("fullscreen.enter", error));
    }
  };

  return (
    <Win95PlayerButton
      onClick={toggle}
      aria-label={t("player.media.panel.fullscreen")}
      title={t("player.media.panel.fullscreen")}
    >
      {fullscreen ? <Minimize className="size-3" /> : <Maximize className="size-3" />}
    </Win95PlayerButton>
  );
}
