import { useI18n } from "@/hooks/i18n.hook";
import type { PlayerSidePanelProps } from "@/types/player";
import Tabs from "@/components/shared/tabs.component";

import LobbyPanel from "./lobby.player";
import PlaylistBody from "./media/playlist.player";

export default function PlayerSidePanel({
  activeTab,
  role,
  sample,
  status,
  onTabChange,
  onOffset,
  onResync,
  onPlay,
  onRemove,
  onMove,
  locked,
}: PlayerSidePanelProps) {
  const { t } = useI18n();

  const tabs = [
    { id: "playlist" as const, label: t("player.media.playlist.title") },
    ...(role ? [{ id: "lobby" as const, label: t("app.lobby") }] : []),
  ];

  return (
    <aside className="windows95-border flex w-80 shrink-0 flex-col bg-primary">
      <div className="windows95-text flex items-center gap-1 border-b-2 border-muted px-1 py-1 text-xs font-bold">
        {role ? (
          <Tabs
            activeTab={activeTab}
            ariaLabel={t("player.media.panel.tabs")}
            onChange={onTabChange}
            tabs={tabs}
          />
        ) : (
          <span className="px-1">{t("player.media.playlist.title")}</span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === "lobby" && role ? (
          <LobbyPanel
            onOffset={onOffset}
            onResync={onResync}
            role={role}
            sample={sample}
            status={status}
          />
        ) : (
          <PlaylistBody locked={locked} onMove={onMove} onPlay={onPlay} onRemove={onRemove} />
        )}
      </div>
    </aside>
  );
}
