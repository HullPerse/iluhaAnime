import { useCallback } from "react";

import { torrentApi } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useTorrentActiveProxy } from "@/hooks/torrent/queries.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { attempt } from "@hullperse/hp_utils/attempt";
import { isValidProxyUrlFor, type ProxyScheme } from "@/lib/core/system/proxy.utils";
import { showError } from "@/lib/core/ui/notification.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { toSessionConfig } from "@/lib/core/player/session.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

const TORRENT_PROXY_SCHEMES: readonly ProxyScheme[] = ["socks5", "socks5h", "http"];

export function TorrentProxySettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const proxyUrl = useCell(settingsAtoms.torrentProxyUrl);
  const activeProxy = useTorrentActiveProxy();

  const applyProxy = useCallback(
    (next: string | null) => {
      if (!isValidProxyUrlFor(next, TORRENT_PROXY_SCHEMES)) return;
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
          schemes={TORRENT_PROXY_SCHEMES}
          onChange={(next) => patchSettings({ torrentProxyUrl: next })}
          onCommit={applyProxy}
          test={async () => {
            const probe = await torrentApi.testTorrentProxy(proxyUrl ?? "");
            return `${probe.latencyMs} ms`;
          }}
          testOkLabel={t("settings.torrent.proxy.test.ok")}
          testFailLabel={t("settings.torrent.proxy.test.fail")}
          testDisabled={!isOnline || !proxyUrl}
        />
        <span className="text-hint pl-[152px] text-xs">
          {t("settings.proxy.torrent.coverage")}
        </span>
        {activeProxy.isSuccess && (
          <span className="text-hint pl-[152px] text-xs">
            {activeProxy.data
              ? t("settings.proxy.torrent.active", { proxy: activeProxy.data })
              : t("settings.proxy.torrent.inactive")}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2 pl-[152px]">
          <span className="text-hint text-xs">{t("settings.torrent.session.restart.note")}</span>
          <Button
            className="h-6 px-2 text-xs"
            onClick={() => {
              torrentApi.restartApp().catch(() => undefined);
            }}
          >
            {t("settings.torrent.session.restart.now")}
          </Button>
        </div>
      </div>
    </section>
  );
}
