import type { ReactNode } from "react";
import { lazy, Suspense, useEffect, useState } from "react";

import { TabLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { SETTINGS_TAB_KEYS } from "@/config/settings/tabs.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { readSettingsTab } from "@/lib/settings/tab.utils";
import { attemptSync } from "@/lib/utils/attempt.utils";
import { SettingsChangelog } from "@/routes/components/settings/changelog.settings";
import SettingsGeneral from "@/routes/components/settings/general.settings";
import SettingsNotifications from "@/routes/components/settings/notifications.settings";
import SettingsSearch from "@/routes/components/settings/search.settings";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";
import SettingsTheme from "@/routes/components/settings/theme.settings";
import SettingsTorrent from "@/routes/components/settings/torrent.settings";
import { useSettingsStore } from "@/store/settings.store";
import type { SettingsTab } from "@/types/settings";

const SettingsSqlite = lazy(() => import("@/routes/components/settings/sqlite/sqlite.settings"));

export default function SettingsRoute() {
  const { t } = useI18n();
  const sqliteBrowserEnabled = useSettingsStore((state) => state.sqliteBrowserEnabled);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => readSettingsTab());
  const navKeys = sqliteBrowserEnabled
    ? [...SETTINGS_TAB_KEYS, { id: "sqlite" as const, key: "settings.sqlite" as TranslationKey }]
    : SETTINGS_TAB_KEYS;
  useEffect(() => {
    if (!sqliteBrowserEnabled && activeTab === "sqlite") setActiveTab("general");
  }, [activeTab, sqliteBrowserEnabled]);

  useEffect(() => {
    const [, error] = attemptSync(() => sessionStorage.setItem("settingsTab", activeTab));
    if (error) console.error(error);
  }, [activeTab]);

  const components: Record<SettingsTab, ReactNode> = {
    general: <SettingsGeneral />,
    notifications: <SettingsNotifications />,
    torrent: <SettingsTorrent />,
    search: <SettingsSearch />,
    theme: <SettingsTheme />,
    changelog: <SettingsChangelog />,
    sqlite: (
      <Suspense fallback={<TabLoader className="min-h-40" />}>
        <SettingsSqlite />
      </Suspense>
    ),
  };

  return (
    <div className="flex h-full flex-row gap-1">
      <nav
        aria-label={t("common.sections")}
        className="windows95-border flex w-34 shrink-0 flex-col gap-0.5 overflow-y-auto bg-white p-1"
      >
        {navKeys.map((tab) => (
          <Button
            key={tab.id}
            className="justify-start text-xs"
            aria-current={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={activeTab === tab.id}
          >
            {t(tab.key)}
          </Button>
        ))}
      </nav>
      <div className="windows95-border bg-primary min-h-0 flex-1 overflow-auto p-1">
        {components[activeTab]}
      </div>
      <SettingsSummary onJump={setActiveTab} />
    </div>
  );
}
