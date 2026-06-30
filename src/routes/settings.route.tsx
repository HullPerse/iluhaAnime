import { useState } from "react";
import { Button } from "@/components/ui/button.component";

import SettingsGeneral from "@/routes/components/settings/general.settings";
import SettingsPlayer from "@/routes/components/settings/player.settings";
import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import SettingsSearch from "@/routes/components/settings/search.settings";
import SettingsTheme from "@/routes/components/settings/theme.settings";

type SettingsTab = "general" | "player" | "torrent" | "search" | "theme";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Общие" },
  { id: "player", label: "Плеер" },
  { id: "torrent", label: "Торренты" },
  { id: "search", label: "Поиск" },
  { id: "theme", label: "Оформление" },
];

export default function SettingsRoute() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const components: Record<SettingsTab, React.ReactNode> = {
    general: <SettingsGeneral />,
    player: <SettingsPlayer />,
    torrent: <SettingsTorrent />,
    search: <SettingsSearch />,
    theme: <SettingsTheme />,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex bg-primary pl-2 pt-1 gap-1 shrink-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              className={`px-3 py-0.5 relative cursor-pointer windows95-text active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text ${
                isActive
                  ? "windows95-active-border border-b-transparent"
                  : "windows95-border bg-surface"
              }`}
              style={{
                top: isActive ? 0 : "2px",
                marginBottom: isActive ? "-2px" : undefined,
                zIndex: isActive ? 20 : 10,
              }}
              onClick={() => setActiveTab(tab.id)}
              disabled={isActive}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>
      <div className="flex-1 overflow-auto windows95-border bg-primary mx-1 mb-1">
        {components[activeTab]}
      </div>
    </div>
  );
}
