import { useQueryClient } from "@tanstack/react-query";
import { confirm } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import { useCallback, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import {
  TORRENT_LISTEN_PORT_KEY,
  usePartialLeftovers,
  useTorrentListenPort,
} from "@/hooks/torrent/queries.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { toSessionConfig } from "@/lib/settings/session.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { showError } from "@/lib/utils/notification.utils";
import { setTorrentSpeedLimits as setSpeedLimits } from "@/store/download.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { SessionConfigPayload } from "@/types/settings";
import type { FileOrder } from "@/types/torrent";

import { NetworkNumberRow } from "./networkNumberRow.settings";
import { SectionResetButton } from "./section-reset-button.settings";

export default function SettingsTorrent() {
  const limits = useCell(settingsAtoms.limits);
  const defaultDownloadDir = useCell(settingsAtoms.defaultDownloadDir);
  const maxConcurrentDownloads = useCell(settingsAtoms.maxConcurrentDownloads);
  const notificationPopups = useCell(settingsAtoms.notificationPopups);
  const popupsOff = notificationPopups === "off";
  const notifyOnComplete = useCell(settingsAtoms.notifyOnComplete);
  const notifyOnError = useCell(settingsAtoms.notifyOnError);
  const fastresumeEnabled = useCell(settingsAtoms.fastresumeEnabled);
  const disablePersistence = useCell(settingsAtoms.disablePersistence);
  const listenPort = useCell(settingsAtoms.listenPort);
  const enableUpnp = useCell(settingsAtoms.enableUpnp);
  const dhtEnabled = useCell(settingsAtoms.dhtEnabled);
  const pexEnabled = useCell(settingsAtoms.pexEnabled);
  const ipv4Only = useCell(settingsAtoms.ipv4Only);
  const peerConnectTimeout = useCell(settingsAtoms.peerConnectTimeout);
  const peerReadWriteTimeout = useCell(settingsAtoms.peerReadWriteTimeout);
  const torrentProxyUrl = useCell(settingsAtoms.torrentProxyUrl);
  const fileOrder = useCell(settingsAtoms.fileOrder);
  const resultsPerPage = useCell(settingsAtoms.resultsPerPage);
  const speedSchedule = useCell(settingsAtoms.speedSchedule);
  const queryClient = useQueryClient();
  const listenPortQuery = useTorrentListenPort();
  const partialLeftoversQuery = usePartialLeftovers();
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const leftovers = partialLeftoversQuery.data ?? [];
  const leftoverBytes = leftovers.reduce(
    (sum, item) =>
      sum + item.files.reduce((fileSum, file) => fileSum + (file.on_disk_bytes ?? 0), 0),
    0
  );
  const clearLeftovers = useCallback(async () => {
    const confirmed = await confirm(t("settings.torrent.leftovers.confirm"));
    if (!confirmed) return;
    const [, error] = await attempt(torrentApi.clearPartialLeftovers());
    if (error) {
      showError(t("settings.torrent.leftovers.clear.failed"), error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.partialLeftovers() });
  }, [queryClient, t]);

  const saveSessionConfig = useCallback(
    (partial: Partial<SessionConfigPayload>) => {
      (async () => {
        const [, error] = await attempt(
          torrentApi.saveSessionConfig({ ...toSessionConfig(), ...partial })
        );
        if (error) showError(t("settings.torrent.session.save.failed"), error.message);
      })();
    },
    [t]
  );
  const [portInput, setPortInput] = useState(String(listenPort));
  const [connectInput, setConnectInput] = useState(String(peerConnectTimeout));
  const [readWriteInput, setReadWriteInput] = useState(String(peerReadWriteTimeout));
  const [proxyInput, setProxyInput] = useState(torrentProxyUrl ?? "");
  const [networkInvalid, setNetworkInvalid] = useState(false);
  const [proxyTesting, setProxyTesting] = useState(false);
  const [proxyTest, setProxyTest] = useState<{ ok: boolean; msg: string } | null>(null);

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
    const port = Number(portInput);
    const connect = Number(connectInput);
    const readWrite = Number(readWriteInput);
    const proxy = proxyInput.trim() || null;
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
    <div className="flex flex-col gap-3">
      <section className="ui-panel" data-find-section="torrent.limits">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.speed.limits")}</span>
          <SectionResetButton sectionId="torrent.limits" />
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
                patchSettings({ limits: { ...limits, download: v } });
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
                patchSettings({ limits: { ...limits, upload: v } });
                setSpeedLimits({ ...limits, upload: v });
              }}
              className="w-20"
            />
          </label>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.defaults">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.defaults")}</span>
          <SectionResetButton sectionId="torrent.defaults" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
            <span className="w-40 shrink-0 font-bold">{t("settings.torrent.default.download.dir")}</span>
            <Input
              value={defaultDownloadDir ?? ""}
              onChange={(e) => patchSettings({ defaultDownloadDir: e.target.value || null })}
              placeholder={t("settings.torrent.default.download.dir.hint")}
              className="flex-1"
            />
          </label>
          <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
            <span className="w-40 shrink-0 font-bold">{t("settings.torrent.default.concurrent")}</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={maxConcurrentDownloads}
              onChange={(e) => patchSettings({ maxConcurrentDownloads: Number(e.target.value) })}
              className="w-16"
            />
          </label>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.schedule">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.schedule")}</span>
          <SectionResetButton sectionId="torrent.schedule" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={speedSchedule.enabled}
              onChange={(v) => patchSettings({ speedSchedule: { ...speedSchedule, enabled: v } })}
            />
            {t("settings.torrent.schedule.enable")}
          </label>
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.torrent.schedule.day")}</span>
            <Input
              type="time"
              className="w-28"
              value={speedSchedule.dayStart}
              onChange={(e) =>
                patchSettings({ speedSchedule: { ...speedSchedule, dayStart: e.target.value } })
              }
            />
            <span className="windows95-text text-text">-</span>
            <Input
              type="time"
              className="w-28"
              value={speedSchedule.nightStart}
              onChange={(e) =>
                patchSettings({ speedSchedule: { ...speedSchedule, nightStart: e.target.value } })
              }
            />
          </label>
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.torrent.schedule.day.limits")}</span>
            <Input
              type="number"
              min={0}
              className="w-20"
              placeholder={t("settings.torrent.no.limit")}
              value={speedSchedule.dayDownload ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                patchSettings({
                  speedSchedule: { ...speedSchedule, dayDownload: v },
                });
              }}
            />
            <Input
              type="number"
              min={0}
              className="w-20"
              placeholder={t("settings.torrent.no.limit")}
              value={speedSchedule.dayUpload ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                patchSettings({
                  speedSchedule: { ...speedSchedule, dayUpload: v },
                });
              }}
            />
          </label>
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.torrent.schedule.night.limits")}</span>
            <Input
              type="number"
              min={0}
              className="w-20"
              placeholder={t("settings.torrent.no.limit")}
              value={speedSchedule.nightDownload ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                patchSettings({
                  speedSchedule: { ...speedSchedule, nightDownload: v },
                });
              }}
            />
            <Input
              type="number"
              min={0}
              className="w-20"
              placeholder={t("settings.torrent.no.limit")}
              value={speedSchedule.nightUpload ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                patchSettings({
                  speedSchedule: { ...speedSchedule, nightUpload: v },
                });
              }}
            />
          </label>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.search">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.search")}</span>
          <SectionResetButton sectionId="torrent.search" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 min-[560px]:grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.torrent.results.per.page")}
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <Input
                type="number"
                min={5}
                max={100}
                value={resultsPerPage}
                onChange={(e) => patchSettings({ resultsPerPage: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.files">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.files")}</span>
          <SectionResetButton sectionId="torrent.files" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
            <span className="w-48 shrink-0 font-bold">{t("settings.torrent.file.order")}</span>
            <Select
              value={fileOrder}
              onChange={(value) => {
                const order = value as FileOrder;
                patchSettings({ fileOrder: order });
                saveSessionConfig({ fileOrder: order });
              }}
              options={[
                { value: "list", label: t("settings.torrent.file.order.list") },
                { value: "torrent", label: t("settings.torrent.file.order.torrent") },
              ]}
              className="h-6 min-[560px]:max-w-70"
            />
          </label>
          <span className="text-hint pl-2 text-xs">
            {t("settings.torrent.file.order.description")}
          </span>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.leftovers">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.torrent.leftovers")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <span className="windows95-text text-text text-xs">
            {leftovers.length === 0
              ? t("settings.torrent.leftovers.none")
              : t("settings.torrent.leftovers.count", {
                  count: leftovers.length,
                  size: formatBytes(leftoverBytes),
                })}
          </span>
          <span className="text-hint pl-2 text-xs">
            {t("settings.torrent.leftovers.hint")}
          </span>
          <div className="pt-1">
            <Button disabled={leftovers.length === 0} onClick={clearLeftovers}>
              {t("settings.torrent.leftovers.clear")}
            </Button>
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.notifications">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.notifications")}</span>
          <SectionResetButton sectionId="torrent.notifications" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 pl-4 select-none">
            <Checkbox
              checked={notifyOnComplete}
              disabled={popupsOff}
              onChange={(v) => patchSettings({ notifyOnComplete: v })}
            />
            <span>{t("settings.torrent.on.complete")}</span>
          </label>

          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 pl-4 select-none">
            <Checkbox
              checked={notifyOnError}
              disabled={popupsOff}
              onChange={(v) => patchSettings({ notifyOnError: v })}
            />
            <span>{t("settings.torrent.on.error")}</span>
          </label>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.session">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.session")}</span>
          <SectionResetButton sectionId="torrent.session" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <span className="text-hint text-xs">{t("settings.torrent.session.restart.note")}</span>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={fastresumeEnabled}
              onChange={(v) => {
                patchSettings({ fastresumeEnabled: v });
                saveSessionConfig({ fastresume: v });
              }}
            />
            <span>{t("settings.torrent.fastresume")}</span>
          </label>

          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={disablePersistence}
              onChange={(v) => {
                patchSettings({ disablePersistence: v });
                saveSessionConfig({ disablePersistence: v });
              }}
            />
            <span>{t("settings.torrent.disable.persistence")}</span>
          </label>
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.network">
        <div className="ui-titlebar flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.network")}</span>
          <SectionResetButton sectionId="torrent.network" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <span className="text-hint text-xs">{t("settings.torrent.session.restart.note")}</span>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={enableUpnp}
              onChange={(v) => {
                patchSettings({ enableUpnp: v });
                saveSessionConfig({ enableUpnp: v });
              }}
            />
            <span>{t("settings.torrent.enable.upnp")}</span>
          </label>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={dhtEnabled}
              onChange={(v) => patchSettings({ dhtEnabled: v })}
            />
            <span>{t("settings.torrent.dht.enabled")}</span>
          </label>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={pexEnabled}
              onChange={(v) => patchSettings({ pexEnabled: v })}
            />
            <span>{t("settings.torrent.pex.enabled")}</span>
          </label>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={ipv4Only}
              onChange={(v) => {
                patchSettings({ ipv4Only: v });
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
          {listenPortQuery.isSuccess && (
            <span className="text-hint pl-2 text-xs">
              {listenPortQuery.data == null
                ? t("settings.torrent.listen.port.idle")
                : t("settings.torrent.listen.port.active", { port: listenPortQuery.data })}
            </span>
          )}
          <label className="windows95-text text-text flex items-center gap-2 select-none">
            <span className="w-48 shrink-0">{t("settings.torrent.proxy.url")}</span>
            <Input
              value={proxyInput}
              placeholder="socks5://127.0.0.1:10808"
              spellCheck={false}
              onChange={(e) => setProxyInput(e.target.value)}
              className="h-6 w-full min-[560px]:max-w-70"
            />
          </label>
          <span className="text-hint pl-2 text-xs">
            {t("settings.torrent.proxy.url.description")}
          </span>
          <div className="flex items-center gap-2 pl-2">
            <Button
              onClick={testProxy}
              disabled={proxyTesting || !isOnline}
              title={isOnline ? undefined : t("tabs.offlineUnavailable")}
              className="text-xs"
            >
              {proxyTesting
                ? t("settings.torrent.proxy.testing")
                : t("settings.torrent.proxy.test")}
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
