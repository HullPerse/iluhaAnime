import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { TORRENT_LISTEN_PORT_KEY, useTorrentListenPort } from "@/hooks/torrent/queries.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { isIntegerInRange } from "@/lib/core/integerRange.utils";
import { isValidProxyUrl } from "@/lib/core/proxy.utils";
import { useCell } from "@/lib/core/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { SessionConfigPayload } from "@/types/ui/settings";

import { NetworkNumberRow } from "@/routes/components/settings/networkNumberRow.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export function TorrentNetworkSettings({
  saveSessionConfig,
}: {
  saveSessionConfig: (partial: Partial<SessionConfigPayload>) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const listenPort = useCell(settingsAtoms.listenPort);
  const enableUpnp = useCell(settingsAtoms.enableUpnp);
  const dhtEnabled = useCell(settingsAtoms.dhtEnabled);
  const pexEnabled = useCell(settingsAtoms.pexEnabled);
  const ipv4Only = useCell(settingsAtoms.ipv4Only);
  const peerConnectTimeout = useCell(settingsAtoms.peerConnectTimeout);
  const peerReadWriteTimeout = useCell(settingsAtoms.peerReadWriteTimeout);
  const torrentProxyUrl = useCell(settingsAtoms.torrentProxyUrl);
  const listenPortQuery = useTorrentListenPort();
  const [portInput, setPortInput] = useState<string>(String(listenPort));
  const [connectInput, setConnectInput] = useState<string>(String(peerConnectTimeout));
  const [readWriteInput, setReadWriteInput] = useState<string>(String(peerReadWriteTimeout));
  const [proxyInput, setProxyInput] = useState<string>(torrentProxyUrl ?? "");
  const [networkInvalid, setNetworkInvalid] = useState<boolean>(false);
  const [proxyTesting, setProxyTesting] = useState<boolean>(false);
  const [proxyTest, setProxyTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const portValid = isIntegerInRange(portInput, 0, 65535);
  const connectValid = isIntegerInRange(connectInput, 1, 3600);
  const readWriteValid = isIntegerInRange(readWriteInput, 1, 3600);
  const proxyValid = isValidProxyUrl(proxyInput);

  const testProxy = async () => {
    setProxyTesting(true);
    setProxyTest(null);
    const proxy = proxyInput.trim();
    const [res, error] = await attempt(torrentApi.testSourceConnection("nyaa", proxy));
    if (error) setProxyTest({ ok: false, msg: error.message });
    else setProxyTest({ ok: true, msg: res });
    setProxyTesting(false);
  };

  const applyNetwork = () => {
    const valid = portValid && connectValid && readWriteValid;
    setNetworkInvalid(!valid);
    if (!valid) return;
    const port = Number(portInput);
    const connect = Number(connectInput);
    const readWrite = Number(readWriteInput);
    const proxy = proxyInput.trim() || null;
    patchSettings({
      listenPort: port,
      peerConnectTimeout: connect,
      peerReadWriteTimeout: readWrite,
      torrentProxyUrl: proxy,
    });
    saveSessionConfig({
      listenPort: port,
      peerConnectTimeout: connect,
      peerReadWriteTimeout: readWrite,
      proxyUrl: proxy,
    });
    queryClient.invalidateQueries({ queryKey: TORRENT_LISTEN_PORT_KEY });
  };

  return (
    <section className="ui-panel" data-find-section="torrent.network">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.torrent.network")}</span>
        <SectionResetButton sectionId="torrent.network" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <span className="text-hint text-xs">{t("settings.torrent.session.restart.note")}</span>
        <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={enableUpnp}
            onChange={(value) => {
              patchSettings({ enableUpnp: value });
              saveSessionConfig({ enableUpnp: value });
            }}
          />
          <span>{t("settings.torrent.enable.upnp")}</span>
        </label>
        <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={dhtEnabled}
            onChange={(value) => patchSettings({ dhtEnabled: value })}
          />
          <span>{t("settings.torrent.dht.enabled")}</span>
        </label>
        <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={pexEnabled}
            onChange={(value) => patchSettings({ pexEnabled: value })}
          />
          <span>{t("settings.torrent.pex.enabled")}</span>
        </label>
        <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={ipv4Only}
            onChange={(value) => {
              patchSettings({ ipv4Only: value });
              saveSessionConfig({ ipv4Only: value });
            }}
          />
          <span>{t("settings.torrent.ipv4.only")}</span>
        </label>
        <NetworkNumberRow
          label={t("settings.torrent.listen.port")}
          value={portInput}
          error={portValid ? undefined : t("settings.torrent.port.invalid")}
          onChange={setPortInput}
        />
        {listenPortQuery.isSuccess && (
          <span className="text-hint pl-2 text-xs">
            {listenPortQuery.data == null
              ? t("settings.torrent.listen.port.idle")
              : t("settings.torrent.listen.port.active", { port: listenPortQuery.data })}
          </span>
        )}
        <label className="group windows95-text text-text flex items-center gap-2 select-none">
          <span className="w-48 shrink-0">{t("settings.torrent.proxy.url")}</span>
          <Input
            value={proxyInput}
            placeholder="socks5://127.0.0.1:10808"
            spellCheck={false}
            onChange={(event) => setProxyInput(event.target.value)}
            className="h-6 w-full min-[560px]:max-w-70"
            aria-invalid={!proxyValid}
          />
        </label>
        {!proxyValid && (
          <span className="text-destructive pl-2 text-xs" role="alert">
            {t("settings.proxy.invalid")}
          </span>
        )}
        <div className="flex items-center gap-2 pl-2">
          <Button
            onClick={testProxy}
            disabled={proxyTesting || !isOnline}
            title={isOnline ? undefined : t("tabs.offlineUnavailable")}
            className="text-xs"
          >
            {proxyTesting ? t("settings.torrent.proxy.testing") : t("settings.torrent.proxy.test")}
          </Button>
          {proxyTest && (
            <span
              className={cn(
                "windows95-text text-xs",
                proxyTest.ok ? "text-success" : "text-destructive"
              )}
            >
              {proxyTest.ok
                ? `${t("settings.torrent.proxy.test.ok")} - ${proxyTest.msg}`
                : `${t("settings.torrent.proxy.test.fail")}: ${proxyTest.msg}`}
            </span>
          )}
        </div>
        <NetworkNumberRow
          label={t("settings.torrent.peer.connect.timeout")}
          value={connectInput}
          error={connectValid ? undefined : t("settings.torrent.timeout.invalid")}
          onChange={setConnectInput}
        />
        <NetworkNumberRow
          label={t("settings.torrent.peer.readwrite.timeout")}
          value={readWriteInput}
          error={readWriteValid ? undefined : t("settings.torrent.timeout.invalid")}
          onChange={setReadWriteInput}
        />
        {networkInvalid && (
          <span className="text-destructive text-xs">{t("settings.torrent.session.invalid")}</span>
        )}
        <div>
          <Button onClick={applyNetwork} className="text-xs">
            {t("settings.torrent.session.apply")}
          </Button>
        </div>
      </div>
    </section>
  );
}
