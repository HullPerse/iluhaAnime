import type { ReactNode } from "react";
import { lazy, Suspense, useEffect, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import SettingsGeneral from "@/routes/components/settings/general.settings";
import SettingsNotifications from "@/routes/components/settings/notifications.settings";
import SettingsSearch from "@/routes/components/settings/search.settings";
import SettingsTheme from "@/routes/components/settings/theme.settings";
import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import { useSettingsStore } from "@/store/settings.store";
import type { SettingsTab } from "@/types";

const SettingsSqlite = lazy(() => import("@/routes/components/settings/sqlite/sqlite.settings"));

const tabKeys: { id: SettingsTab; key: TranslationKey }[] = [
  { id: "general", key: "settings.general" },
  { id: "notifications", key: "settings.notifications" },
  { id: "search", key: "settings.search" },
  { id: "torrent", key: "settings.torrent" },
  { id: "theme", key: "settings.theme" },
];

export default function SettingsRoute() {
  const { t } = useI18n();
  const sqliteBrowserEnabled = useSettingsStore((state) => state.sqliteBrowserEnabled);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const visibleTabKeys = sqliteBrowserEnabled
    ? [...tabKeys, { id: "sqlite" as const, key: "settings.sqlite" as TranslationKey }]
    : tabKeys;
  useEffect(() => {
    if (!sqliteBrowserEnabled && activeTab === "sqlite") setActiveTab("general");
  }, [activeTab, sqliteBrowserEnabled]);
  const tabs = visibleTabKeys.map((tab) => ({ ...tab, label: t(tab.key) }));

  const components: Record<SettingsTab, ReactNode> = {
    general: <SettingsGeneral />,
    notifications: <SettingsNotifications />,
    torrent: <SettingsTorrent />,
    search: <SettingsSearch />,
    theme: <SettingsTheme />,
    sqlite: (
      <Suspense
        fallback={
          <div className="flex min-h-40 items-center justify-center p-2">
            <SmallLoader />
          </div>
        }
      >
        <SettingsSqlite />
      </Suspense>
    ),
  };

  return (
    <div className="flex h-full flex-col">
      <Tabs
        ariaLabel={t("common.sections")}
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      <div className="windows95-border bg-primary mx-1 mb-1 min-h-0 flex-1 overflow-auto p-1">
        {components[activeTab]}
      </div>
    </div>
  );
}
