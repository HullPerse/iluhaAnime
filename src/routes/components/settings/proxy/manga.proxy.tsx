import { useCell } from "@hullperse/hp_utils/react";

import { mangaSources, testMangaSourceProxy } from "@/api/manga.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import MangaLibDomains from "@/routes/components/manga/sources/domains.sources";
import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

export default function MangaProxySettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const common = useCell(settingsAtoms.mangaProxyUrl);
  const overrides = useCell(settingsAtoms.mangaSourceProxies);

  return (
    <section
      className="ui-panel"
      data-find-section="proxy.manga"
      aria-labelledby="settings-manga-proxy"
    >
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <h2 id="settings-manga-proxy">{t("settings.manga.proxy.title")}</h2>
        <SectionResetButton sectionId="proxy.manga" />
      </div>
      <div className="flex flex-col gap-2 p-2">
        <ProxyField
          label={t("settings.manga.proxy.common")}
          value={common || null}
          onChange={(next) => patchSettings({ mangaProxyUrl: next ?? "" })}
          test={() => testMangaSourceProxy(null, common)}
          testDisabled={!isOnline}
        />
        {mangaSources.map(({ id, name }) => (
          <ProxyField
            key={id}
            label={t("settings.manga.proxy.override", { source: name })}
            value={overrides[id] || null}
            placeholder={t("settings.manga.proxy.inherit")}
            onChange={(next) => {
              const nextProxies = { ...overrides };

              if (next === null) delete nextProxies[id];
              else nextProxies[id] = next;
              patchSettings({ mangaSourceProxies: nextProxies });
            }}
            test={() => testMangaSourceProxy(id, effectiveProxyUrl(overrides[id], common) ?? "")}
            testDisabled={!isOnline}
          />
        ))}
      </div>
      <div className="px-2 pb-2">
        <MangaLibDomains />
      </div>
    </section>
  );
}
