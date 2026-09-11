import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toSessionConfig } from "@/lib/settings/session.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useTorrentStore } from "@/store/download.store";
import { useSettingsStore } from "@/store/settings.store";
import type { SessionConfigPayload } from "@/types/settings";

function NetworkNumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="windows95-text text-text flex items-center gap-2 select-none">
      <span className="w-48 shrink-0">{label}</span>
      <Input className="h-6 w-24" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function SettingsTorrent() {
  const {
    limits,
    notificationsEnabled,
    notifyOnComplete,
    notifyOnError,
    fastresumeEnabled,
    disablePersistence,
    listenPort,
    enableUpnp,
    ipv4Only,
    peerConnectTimeout,
    peerReadWriteTimeout,
    resultsPerPage,
    patch,
  } = useSettingsStore();
  const setSpeedLimits = useTorrentStore((s) => s.setSpeedLimits);
  const { t } = useI18n();

  const saveSessionConfig = useCallback(
    (partial: Partial<SessionConfigPayload>) => {
      invokeTyped("save_session_config", {
        config: { ...toSessionConfig(), ...partial },
      }).catch((error) =>
        showError(
          t("settings.torrent.session.save.failed"),
          error instanceof Error ? error.message : String(error)
        )
      );
    },
    [t]
  );
  const [portInput, setPortInput] = useState(String(listenPort));
  const [connectInput, setConnectInput] = useState(String(peerConnectTimeout));
  const [readWriteInput, setReadWriteInput] = useState(String(peerReadWriteTimeout));
  const [networkInvalid, setNetworkInvalid] = useState(false);
  const applyNetwork = () => {
    const port = Number(portInput);
    const connect = Number(connectInput);
    const readWrite = Number(readWriteInput);
    const valid =
      Number.isInteger(port) &&
      port >= 0 &&
      port <= 65535 &&
      Number.isInteger(connect) &&
      connect >= 1 &&
      connect <= 3600 &&
      Number.isInteger(readWrite) &&
      readWrite >= 1 &&
      readWrite <= 3600;
    setNetworkInvalid(!valid);
    if (!valid) return;
    patch({ listenPort: port, peerConnectTimeout: connect, peerReadWriteTimeout: readWrite });
    saveSessionConfig({
      listenPort: port,
      peerConnectTimeout: connect,
      peerReadWriteTimeout: readWrite,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.torrent.speed.limits")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.torrent.dl.limit")}</span>
            <Input
              type="number"
              min={0}
              value={limits.download ?? ""}
              placeholder={t("settings.torrent.no.limit")}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                patch({ limits: { ...limits, download: v } });
                setSpeedLimits({ ...limits, download: v });
              }}
              className="w-20"
            />
          </label>

          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.torrent.ul.limit")}</span>
            <Input
              type="number"
              min={0}
              value={limits.upload ?? ""}
              placeholder={t("settings.torrent.no.limit")}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                patch({ limits: { ...limits, upload: v } });
                setSpeedLimits({ ...limits, upload: v });
              }}
              className="w-20"
            />
          </label>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.torrent.search")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.torrent.results.per.page")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Input
                type="number"
                min={5}
                max={100}
                value={resultsPerPage}
                onChange={(e) => patch({ resultsPerPage: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.torrent.notifications")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={notificationsEnabled}
              onChange={(v) => patch({ notificationsEnabled: v })}
            />
            <span>{t("settings.torrent.enable.notifications")}</span>
          </label>

          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 pl-4 select-none">
            <Checkbox
              checked={notifyOnComplete}
              disabled={!notificationsEnabled}
              onChange={(v) => patch({ notifyOnComplete: v })}
            />
            <span>{t("settings.torrent.on.complete")}</span>
          </label>

          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 pl-4 select-none">
            <Checkbox
              checked={notifyOnError}
              disabled={!notificationsEnabled}
              onChange={(v) => patch({ notifyOnError: v })}
            />
            <span>{t("settings.torrent.on.error")}</span>
          </label>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.torrent.session")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <span className="text-hint text-xs">{t("settings.torrent.session.restart.note")}</span>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={fastresumeEnabled}
              onChange={(v) => {
                patch({ fastresumeEnabled: v });
                saveSessionConfig({ fastresume: v });
              }}
            />
            <span>{t("settings.torrent.fastresume")}</span>
          </label>

          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={disablePersistence}
              onChange={(v) => {
                patch({ disablePersistence: v });
                saveSessionConfig({ disablePersistence: v });
              }}
            />
            <span>{t("settings.torrent.disable.persistence")}</span>
          </label>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.torrent.network")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <span className="text-hint text-xs">{t("settings.torrent.session.restart.note")}</span>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={enableUpnp}
              onChange={(v) => {
                patch({ enableUpnp: v });
                saveSessionConfig({ enableUpnp: v });
              }}
            />
            <span>{t("settings.torrent.enable.upnp")}</span>
          </label>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={ipv4Only}
              onChange={(v) => {
                patch({ ipv4Only: v });
                saveSessionConfig({ ipv4Only: v });
              }}
            />
            <span>{t("settings.torrent.ipv4.only")}</span>
          </label>
          <NetworkNumberRow
            label={t("settings.torrent.listen.port")}
            value={portInput}
            onChange={setPortInput}
          />
          <NetworkNumberRow
            label={t("settings.torrent.peer.connect.timeout")}
            value={connectInput}
            onChange={setConnectInput}
          />
          <NetworkNumberRow
            label={t("settings.torrent.peer.readwrite.timeout")}
            value={readWriteInput}
            onChange={setReadWriteInput}
          />
          {networkInvalid && (
            <span className="text-destructive text-xs">
              {t("settings.torrent.session.invalid")}
            </span>
          )}
          <div>
            <Button onClick={applyNetwork} className="text-xs">
              {t("settings.torrent.session.apply")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
