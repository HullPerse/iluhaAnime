import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import {
  NOTIFICATION_POPUP_MODES,
  NOTIFICATION_POPUP_KEYS,
  POLL_INTERVALS_MIN,
} from "@/config/system/notifications.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { ignore } from "@/lib/core/promise.utils";
import { anilistNotificationsAtoms, setKnownAnilistListNames } from "@/store/anilist.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { NotificationPopupMode } from "@/types/ui/settings";

import { SectionResetButton } from "@/routes/components/settings/reset.settings";
import NotifyRow from "@/routes/components/settings/notifyRow.settings";

export default function SettingsNotifications() {
  const { t } = useI18n();
  const notificationPopups = useCell(settingsAtoms.notificationPopups);
  const anilistReleaseNotifications = useCell(settingsAtoms.anilistReleaseNotifications);
  const notifyNewEpisodes = useCell(settingsAtoms.notifyNewEpisodes);
  const notifyStatusChanges = useCell(settingsAtoms.notifyStatusChanges);
  const notifyMediaStatus = useCell(settingsAtoms.notifyMediaStatus);
  const notifySubscribedReplies = useCell(settingsAtoms.notifySubscribedReplies);
  const notifyMediaMerge = useCell(settingsAtoms.notifyMediaMerge);
  const notifySequel = useCell(settingsAtoms.notifySequel);
  const anilistPollIntervalMin = useCell(settingsAtoms.anilistPollIntervalMin);
  const anilistNotifyLists = useCell(settingsAtoms.anilistNotifyLists);
  const notifyTorrentHealth = useCell(settingsAtoms.notifyTorrentHealth);
  const notifyUpscaleDone = useCell(settingsAtoms.notifyUpscaleDone);
  const notifyModelDownloads = useCell(settingsAtoms.notifyModelDownloads);
  const notifyBackup = useCell(settingsAtoms.notifyBackup);
  const notifyScanErrors = useCell(settingsAtoms.notifyScanErrors);
  const knownListNames = useCell(anilistNotificationsAtoms.knownListNames);
  const listNamesQuery = useAppQuery("slow", {
    queryKey: queryKeys.anilistListNames(),
    queryFn: async () => {
      const user = await anilistApi.checkAuth();
      if (!user) throw new Error("not authenticated");
      const lists = await anilistApi.getLists(user.id, true);
      return lists.map((list) => list.name);
    },
    enabled: knownListNames.length === 0,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (listNamesQuery.data) setKnownAnilistListNames(listNamesQuery.data);
  }, [listNamesQuery.data]);
  const listsLoading = listNamesQuery.isLoading || listNamesQuery.isFetching;
  const listsFailed = listNamesQuery.isError;

  const toggleList = (name: string) => {
    const current = anilistNotifyLists ?? knownListNames;
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
    patchSettings({ anilistNotifyLists: next.length === knownListNames.length ? null : next });
  };

  const anilistOff = !anilistReleaseNotifications;

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel" data-find-section="notifications.system">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.notifications.system")}</span>
          <SectionResetButton sectionId="notifications.system" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex items-center gap-2 text-xs font-bold">
            <span className="shrink-0">{t("settings.notifications.popups")}</span>
            <Select
              value={notificationPopups}
              onChange={(v) => {
                if ((NOTIFICATION_POPUP_MODES as readonly string[]).includes(v)) {
                  patchSettings({ notificationPopups: v as NotificationPopupMode });
                }
              }}
              options={NOTIFICATION_POPUP_MODES.map((mode) => ({
                value: mode,
                label: t(NOTIFICATION_POPUP_KEYS[mode]),
              }))}
              className="w-48"
            />
          </label>
        </div>
      </section>

      <section className="ui-panel" data-find-section="notifications.anilist">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.anilist")}
          </span>
          <SectionResetButton sectionId="notifications.anilist" />
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.anilist.release.notifications")}
            checked={anilistReleaseNotifications}
            onChange={(v) => patchSettings({ anilistReleaseNotifications: v })}
          />
          <NotifyRow
            label={t("settings.notifications.episodes")}
            checked={notifyNewEpisodes}
            disabled={anilistOff}
            onChange={(v) => patchSettings({ notifyNewEpisodes: v })}
          />
          <NotifyRow
            label={t("settings.notifications.statuses")}
            checked={notifyStatusChanges}
            disabled={anilistOff}
            onChange={(v) => patchSettings({ notifyStatusChanges: v })}
          />
          <NotifyRow
            label={t("settings.notifications.media.status")}
            checked={notifyMediaStatus}
            disabled={anilistOff}
            onChange={(v) => patchSettings({ notifyMediaStatus: v })}
          />
          <NotifyRow
            label={t("settings.notifications.subscribed")}
            checked={notifySubscribedReplies}
            disabled={anilistOff}
            onChange={(v) => patchSettings({ notifySubscribedReplies: v })}
          />
          <NotifyRow
            label={t("settings.notifications.merge")}
            checked={notifyMediaMerge}
            disabled={anilistOff}
            onChange={(v) => patchSettings({ notifyMediaMerge: v })}
          />
          <NotifyRow
            label={t("settings.notifications.sequel")}
            checked={notifySequel}
            disabled={anilistOff}
            onChange={(v) => patchSettings({ notifySequel: v })}
          />
          <div className="mt-1 flex items-center gap-2">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.notifications.interval")}
            </span>
            <Select
              value={String(anilistPollIntervalMin)}
              disabled={anilistOff}
              onChange={(v) => patchSettings({ anilistPollIntervalMin: Number(v) })}
              options={POLL_INTERVALS_MIN.map((m) => ({
                value: String(m),
                label: `${m} ${t("settings.notifications.interval.min")}`,
              }))}
              className="w-32"
            />
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="windows95-text text-text text-xs font-bold">
                {t("settings.notifications.lists")}
              </span>
              <Button
                size="icon"
                className="size-5"
                title={t("settings.notifications.lists.refresh")}
                onClick={() => ignore(listNamesQuery.refetch())}
                disabled={listsLoading}
              >
                <RefreshCw className="size-3" />
              </Button>
              {listsLoading && (
                <span className="text-hint text-[12px]">{`${t("common.loading")}...`}</span>
              )}
              {!listsLoading && knownListNames.length === 0 && listsFailed && (
                <span className="text-hint text-[12px]">
                  {t("settings.notifications.lists.unavailable")}
                </span>
              )}
            </div>
            {knownListNames.map((name) => (
              <NotifyRow
                key={name}
                label={name}
                checked={anilistNotifyLists === null || anilistNotifyLists.includes(name)}
                disabled={anilistOff}
                onChange={() => toggleList(name)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="notifications.torrents">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.torrents")}
          </span>
          <SectionResetButton sectionId="notifications.torrents" />
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.notifications.torrent.health")}
            checked={notifyTorrentHealth}
            onChange={(v) => patchSettings({ notifyTorrentHealth: v })}
          />
        </div>
      </section>

      <section className="ui-panel" data-find-section="notifications.tasks">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.tasks")}
          </span>
          <SectionResetButton sectionId="notifications.tasks" />
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.notifications.upscale")}
            checked={notifyUpscaleDone}
            onChange={(v) => patchSettings({ notifyUpscaleDone: v })}
          />
          <NotifyRow
            label={t("settings.notifications.models")}
            checked={notifyModelDownloads}
            onChange={(v) => patchSettings({ notifyModelDownloads: v })}
          />
          <NotifyRow
            label={t("settings.notifications.backup")}
            checked={notifyBackup}
            onChange={(v) => patchSettings({ notifyBackup: v })}
          />
        </div>
      </section>

      <section className="ui-panel" data-find-section="notifications.app">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.notifications.group.app")}</span>
          <SectionResetButton sectionId="notifications.app" />
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.notifications.scan")}
            checked={notifyScanErrors}
            onChange={(v) => patchSettings({ notifyScanErrors: v })}
          />
        </div>
      </section>
    </div>
  );
}
