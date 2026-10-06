import { useI18n } from "@/hooks/i18n.hook";
import type { PlayerSidePanelProps } from "@/types/player";

import PlaylistBody from "./media/playlist.player";

export default function PlayerSidePanel({ onPlay, onRemove, onMove }: PlayerSidePanelProps) {
  const { t } = useI18n();

  return (
    <aside className="windows95-border bg-primary flex w-80 shrink-0 flex-col">
      <div className="windows95-text border-muted flex items-center gap-1 border-b-2 px-1 py-1 text-xs font-bold">
        <span className="px-1">{t("player.media.playlist.title")}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <PlaylistBody onMove={onMove} onPlay={onPlay} onRemove={onRemove} />
      </div>
    </aside>
  );
}
