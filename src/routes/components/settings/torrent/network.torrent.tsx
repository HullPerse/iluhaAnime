import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import { TORRENT_LISTEN_PORT_KEY, useTorrentListenPort } from "@/hooks/torrent/queries.hook";
import { isIntegerInRange } from "@/lib/core/integerRange.utils";
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
  const listenPort = useCell(settingsAtoms.listenPort);
  const enableUpnp = useCell(settingsAtoms.enableUpnp);
  const dhtEnabled = useCell(settingsAtoms.dhtEnabled);
  const pexEnabled = useCell(settingsAtoms.pexEnabled);
  const ipv4Only = useCell(settingsAtoms.ipv4Only);
  const peerConnectTimeout = useCell(settingsAtoms.peerConnectTimeout);
  const peerReadWriteTimeout = useCell(settingsAtoms.peerReadWriteTimeout);
  const listenPortQuery = useTorrentListenPort();
  const [portInput, setPortInput] = useState<string>(String(listenPort));
  const [connectInput, setConnectInput] = useState<string>(String(peerConnectTimeout));
  const [readWriteInput, setReadWriteInput] = useState<string>(String(peerReadWriteTimeout));
  const [networkInvalid, setNetworkInvalid] = useState<boolean>(false);
  const portValid = isIntegerInRange(portInput, 0, 65535);
  const connectValid = isIntegerInRange(connectInput, 1, 3600);
  const readWriteValid = isIntegerInRange(readWriteInput, 1, 3600);

  const applyNetwork = () => {
    const valid = portValid && connectValid && readWriteValid;
    setNetworkInvalid(!valid);
    if (!valid) return;
    const port = Number(portInput);
    const connect = Number(connectInput);
    const readWrite = Number(readWriteInput);
    patchSettings({
      listenPort: port,
      peerConnectTimeout: connect,
      peerReadWriteTimeout: readWrite,
    });
    saveSessionConfig({
      listenPort: port,
      peerConnectTimeout: connect,
      peerReadWriteTimeout: readWrite,
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
