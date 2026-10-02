import { Maximize, Maximize2, Minimize, Minimize2, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

function PlayerHeader({
  title,
  cinema,
  fullscreen,
  onOpenSettings,
  onToggleCinema,
  onToggleFullscreen,
  onClose,
}: {
  title: string;
  cinema: boolean;
  fullscreen: boolean;
  onOpenSettings: () => void;
  onToggleCinema: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <main className="flex w-full flex-row items-center justify-between bg-secondary p-1">
      <span className="windows95-text line-clamp-1 font-bold text-white">{title}</span>
      <div className="flex flex-row items-center gap-1">
        <Button
          size="icon"
          className="size-4"
          title={t("player.media.panel.settings")}
          aria-label={t("player.media.panel.settings")}
          onClick={onOpenSettings}
        >
          <Settings className="size-3" />
        </Button>
        <Button
          size="icon"
          className="size-4"
          title={cinema ? t("player.media.header.cinema.exit") : t("player.media.header.cinema")}
          aria-label={t("player.media.header.cinema")}
          onClick={onToggleCinema}
        >
          {cinema ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
        </Button>
        <Button
          size="icon"
          className="size-4"
          aria-label={t("player.media.panel.fullscreen")}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
        <Button
          size="icon"
          className="size-4"
          aria-label={t("player.media.panel.close")}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
    </main>
  );
}

export default PlayerHeader;
