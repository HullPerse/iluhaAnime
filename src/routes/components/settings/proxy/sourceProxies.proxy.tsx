import { useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { SOURCE_INFOS } from "@/config/search/searchSources.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useCell } from "@/lib/core/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export function SourceProxySettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const visibleSources = useCell(settingsAtoms.visibleSources);
  const searchProxyUrls = useCell(settingsAtoms.searchProxyUrls);
  const webviewProxyEnabled = useCell(settingsAtoms.webviewProxyEnabled);
  const [runAllToken, setRunAllToken] = useState<number>(0);
  const sources = SOURCE_INFOS.filter((source) => visibleSources.includes(source.value));

  const setProxy = (source: string, next: string | null) => {
    const nextProxies = { ...searchProxyUrls };
    if (next === null) delete nextProxies[source];
    else nextProxies[source] = next;
    patchSettings({ searchProxyUrls: nextProxies });
  };

  return (
    <section className="ui-panel" data-find-section="proxy.sources">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.proxy.sources.title")}</span>
        <SectionResetButton sectionId="proxy.sources" />
      </div>
      <div className="flex flex-col gap-2 p-2">
        <span className="text-hint text-xs">{t("settings.proxy.sources.description")}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="windows95-text text-text text-xs font-bold">
            {t("settings.search.proxy.per.source")}
          </span>
          <Button
            className="h-6 px-2 text-xs"
            onClick={() => setRunAllToken((token) => token + 1)}
            disabled={sources.length === 0 || !isOnline}
          >
            {t("settings.search.proxy.test.all")}
          </Button>
        </div>
        {sources.length === 0 ? (
          <span className="text-hint text-[12px]">{t("settings.search.no.visible.sources")}</span>
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((source) => {
              const current = searchProxyUrls[source.value] ?? null;
              return (
                <ProxyField
                  key={source.value}
                  label={source.label}
                  value={current}
                  onChange={(next) => setProxy(source.value, next)}
                  test={() =>
                    torrentApi.testSourceConnection(source.value, searchProxyUrls[source.value] ?? "")
                  }
                  testOkLabel={t("settings.search.proxy.test.ok")}
                  testFailLabel={t("settings.search.proxy.test.fail")}
                  testDisabled={!isOnline}
                  runToken={runAllToken}
                />
              );
            })}
          </div>
        )}
        <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={webviewProxyEnabled}
            onChange={() => patchSettings({ webviewProxyEnabled: !webviewProxyEnabled })}
          />
          <span className="text-xs font-bold">{t("settings.search.proxy.webview")}</span>
        </label>
      </div>
    </section>
  );
}
