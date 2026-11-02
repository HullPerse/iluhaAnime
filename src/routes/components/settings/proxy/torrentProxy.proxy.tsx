import { useCallback } from "react";

import { torrentApi } from "@/api/torrent.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { isValidProxyUrl } from "@/lib/core/proxy.utils";
import { showError } from "@/lib/core/notification.utils";
import { useCell } from "@/lib/core/signal.hook";
import { toSessionConfig } from "@/lib/core/session.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export function TorrentProxySettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const proxyUrl = useCell(settingsAtoms.torrentProxyUrl);

  const applyProxy = useCallback(
    (next: string | null) => {
      if (!isValidProxyUrl(next)) return;
      (async () => {
        const [, error] = await attempt(
          torrentApi.saveSessionConfig({ ...toSessionConfig(), proxyUrl: next })
        );
        if (error) showError(t("settings.torrent.session.save.failed"), error.message);
      })();
    },
    [t]
  );

  return (
    <section className="ui-panel" data-find-section="proxy.torrent">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.proxy.torrent.title")}</span>
        <SectionResetButton sectionId="proxy.torrent" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <ProxyField
          label={t("settings.torrent.proxy.url")}
          description={t("settings.proxy.torrent.description")}
          value={proxyUrl}
          onChange={(next) => patchSettings({ torrentProxyUrl: next })}
          onCommit={applyProxy}
          test={() => torrentApi.testSourceConnection("nyaa", proxyUrl ?? "")}
          testOkLabel={t("settings.torrent.proxy.test.ok")}
          testFailLabel={t("settings.torrent.proxy.test.fail")}
          testDisabled={!isOnline}
        />
      </div>
    </section>
  );
}
