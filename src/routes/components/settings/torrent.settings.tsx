import { useQueryClient } from "@tanstack/react-query";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { torrentApi } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { usePartialLeftovers } from "@/hooks/torrent/queries.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { toSessionConfig } from "@/lib/core/player/session.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { attempt } from "@hullperse/hp_utils/attempt";
import { formatBytes } from "@hullperse/hp_utils/bytes";
import { showError } from "@/lib/core/ui/notification.utils";
import { setTorrentSpeedLimits as setSpeedLimits } from "@/store/download.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { SessionConfigPayload } from "@/types/ui/settings";
import type { FileOrder } from "@/types/torrent/torrent";

import { SectionResetButton } from "@/routes/components/settings/reset.settings";
import { TorrentDiagnosticsSettings } from "@/routes/components/settings/torrent/diagnostics.torrent";
import { TorrentNetworkSettings } from "@/routes/components/settings/torrent/network.torrent";

export default function SettingsTorrent() {
  const limits = useCell(settingsAtoms.limits);
  const defaultDownloadDir = useCell(settingsAtoms.defaultDownloadDir);
  const maxConcurrentDownloads = useCell(settingsAtoms.maxConcurrentDownloads);
  const fastresumeEnabled = useCell(settingsAtoms.fastresumeEnabled);
  const disablePersistence = useCell(settingsAtoms.disablePersistence);
  const fileOrder = useCell(settingsAtoms.fileOrder);
  const searchResultsPerPage = useCell(settingsAtoms.searchResultsPerPage);
  const speedSchedule = useCell(settingsAtoms.speedSchedule);
  const queryClient = useQueryClient();
  const partialLeftoversQuery = usePartialLeftovers();
  const { t } = useI18n();
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
  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel" data-find-section="torrent.limits">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.speed.limits")}</span>
          <SectionResetButton sectionId="torrent.limits" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="group flex flex-col gap-1">
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
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.defaults">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.defaults")}</span>
          <SectionResetButton sectionId="torrent.defaults" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="group windows95-text text-text flex items-center gap-2 text-xs select-none">
            <span className="w-40 shrink-0 font-bold">
              {t("settings.torrent.default.download.dir")}
            </span>
            <Input
              value={defaultDownloadDir ?? ""}
              onChange={(e) => patchSettings({ defaultDownloadDir: e.target.value || null })}
              placeholder={t("settings.torrent.default.download.dir.hint")}
              className="flex-1"
            />
          </label>
          <label className="group windows95-text text-text flex items-center gap-2 text-xs select-none">
            <span className="w-40 shrink-0 font-bold">
              {t("settings.torrent.default.concurrent")}
            </span>
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

      <section className="ui-panel" data-find-section="torrent.session">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.session")}</span>
          <SectionResetButton sectionId="torrent.session" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={fastresumeEnabled}
              onChange={(v) => {
                patchSettings({ fastresumeEnabled: v });
                saveSessionConfig({ fastresume: v });
              }}
            />
            <span>{t("settings.torrent.fastresume")}</span>
          </label>

          <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
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

      <TorrentNetworkSettings saveSessionConfig={saveSessionConfig} />
      <TorrentDiagnosticsSettings />
      <section className="ui-panel" data-find-section="torrent.schedule">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.schedule")}</span>
          <SectionResetButton sectionId="torrent.schedule" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
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

      <section className="ui-panel" data-find-section="torrent.files">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.files")}</span>
          <SectionResetButton sectionId="torrent.files" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="group windows95-text text-text flex items-center gap-2 text-xs select-none">
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
        </div>
      </section>

      <section className="ui-panel" data-find-section="torrent.search">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.torrent.search")}</span>
          <SectionResetButton sectionId="torrent.search" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.torrent.results.per.page")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Input
                type="number"
                min={5}
                max={100}
                value={searchResultsPerPage}
                onChange={(e) => patchSettings({ searchResultsPerPage: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>
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
          <span className="text-hint pl-2 text-xs">{t("settings.torrent.leftovers.hint")}</span>
          <div className="pt-1">
            <Button disabled={leftovers.length === 0} onClick={clearLeftovers}>
              {t("settings.torrent.leftovers.clear")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
