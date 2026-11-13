
import { anilistApi } from "@/api/anilist.api";
import { newsApi } from "@/api/news.api";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { PROXY_TEST_SLOW_MS } from "@/hooks/proxyTest.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import AnimelibSettings from "@/routes/components/settings/animelib.settings";
import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SourceProxySettings } from "@/routes/components/settings/proxy/sourceProxies.proxy";
import { TorrentProxySettings } from "@/routes/components/settings/proxy/torrentProxy.proxy";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export default function SettingsProxy() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const anilistProxyUrl = useCell(settingsAtoms.anilistProxyUrl);
  const newsProxyUrl = useCell(settingsAtoms.newsProxyUrl);
  const anilistTitleLanguage = useCell(settingsAtoms.anilistTitleLanguage);
  const anilistAdultContent = useCell(settingsAtoms.anilistAdultContent);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-hint windows95-text px-1 text-xs">
        {t("settings.proxy.description", { seconds: PROXY_TEST_SLOW_MS / 1000 })}
      </p>


      <section className="ui-panel" data-find-section="proxy.anilist">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.anilist.proxy.title")}</span>
          <SectionResetButton sectionId="proxy.anilist" />
        </div>
        <div className="flex flex-col gap-2 p-2">
          <ProxyField
            label={t("settings.anilist.proxy.url")}
            value={anilistProxyUrl}
            onChange={(next) => patchSettings({ anilistProxyUrl: next })}
            test={() => anilistApi.testConnection()}
            testOkLabel={t("settings.anilist.proxy.test.ok")}
            testFailLabel={t("settings.anilist.proxy.test.fail")}
            testDisabled={!isOnline}
          />

          <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.anilist.title.language")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Select
                value={anilistTitleLanguage}
                onChange={(value) => patchSettings({ anilistTitleLanguage: value })}
                options={[
                  { value: "account", label: t("settings.anilist.title.account") },
                  { value: "romaji", label: t("settings.anilist.title.romaji") },
                  { value: "english", label: t("settings.anilist.title.english") },
                  { value: "native", label: t("settings.anilist.title.native") },
                ]}
                className="w-52"
              />
            </div>

            <span className="windows95-text text-destructive flex items-center text-xs font-bold">
              {t("settings.anilist.adult")}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={anilistAdultContent}
                  onChange={(value) => patchSettings({ anilistAdultContent: value })}
                />
                <span>{t("settings.anilist.adult.description")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="proxy.news">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.news.proxy.title")}</span>
          <SectionResetButton sectionId="proxy.news" />
        </div>
        <div className="flex flex-col gap-2 p-2">
          <span className="text-hint text-xs">{t("settings.news.proxy.description")}</span>
          <ProxyField
            label={t("settings.news.proxy.url")}
            value={newsProxyUrl}
            onChange={(next) => patchSettings({ newsProxyUrl: next })}
            test={() => newsApi.testConnection(newsProxyUrl)}
            testOkLabel={t("settings.anilist.proxy.test.ok")}
            testFailLabel={t("settings.anilist.proxy.test.fail")}
            testDisabled={!isOnline}
          />
        </div>
      </section>

      <AnimelibSettings />
      <TorrentProxySettings />
      <SourceProxySettings />
    </div>
  );
}
