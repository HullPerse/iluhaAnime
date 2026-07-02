import { useState } from "react";
import Tabs from "@/components/shared/tabs.component";

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
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="flex-1 overflow-auto windows95-border bg-primary mx-1 mb-1">
        {components[activeTab]}
      </div>
    </div>
  );
}
