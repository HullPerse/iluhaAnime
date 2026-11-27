import { streamApi } from "@/api/stream.api";
import { STREAM_SOURCES } from "@/config/player/streamSources.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { StreamSourceId } from "@/types/player/stream";

import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export function StreamProxySettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const streamProxyUrls = useCell(settingsAtoms.streamProxyUrls);
  const animelibProxyUrl = useCell(settingsAtoms.animelibProxyUrl);

  const setProxy = (source: StreamSourceId, next: string | null) => {
    const nextProxies = { ...streamProxyUrls };

    if (next === null) delete nextProxies[source];
    else nextProxies[source] = next;
    patchSettings({ streamProxyUrls: nextProxies });
  };

  return (
    <section className="ui-panel" data-find-section="proxy.stream">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.proxy.stream.title")}</span>
        <SectionResetButton sectionId="proxy.stream" />
      </div>
      <div className="flex flex-col gap-2 p-2">
        <span className="windows95-text text-text text-xs font-bold">
          {t("settings.proxy.stream.per.source")}
        </span>
        {STREAM_SOURCES.map((source) => (
          <ProxyField
            key={source.id}
            label={source.name}
            value={
              streamProxyUrls[source.id] ?? (source.id === "animelib" ? animelibProxyUrl : null)
            }
            onChange={(next) => setProxy(source.id, next)}
            test={() => streamApi.testConnection(source.id)}
            testOkLabel={t("settings.proxy.test.ok")}
            testFailLabel={t("settings.proxy.test.fail")}
            testDisabled={!isOnline}
          />
        ))}
      </div>
    </section>
  );
}
