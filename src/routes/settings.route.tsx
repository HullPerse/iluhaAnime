import { ReactNode, useState } from "react";
import Tabs from "@/components/shared/tabs.component";
import type { SettingsTab } from "@/types";

import SettingsGeneral from "@/routes/components/settings/general.settings";
import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import SettingsNetwork from "@/routes/components/settings/network.settings";
import SettingsSearch from "@/routes/components/settings/search.settings";
import SettingsTheme from "@/routes/components/settings/theme.settings";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Общие" },
  { id: "search", label: "Поиск" },
  { id: "torrent", label: "Торренты" },
  { id: "network", label: "Сеть" },
  { id: "theme", label: "Оформление" },
];

export default function SettingsRoute() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const components: Record<SettingsTab, ReactNode> = {
    general: <SettingsGeneral />,
    torrent: <SettingsTorrent />,
    network: <SettingsNetwork />,
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
