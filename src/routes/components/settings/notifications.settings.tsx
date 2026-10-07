import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { POLL_INTERVALS_MIN } from "@/config/settings/notifications.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { anilistNotificationsAtoms, setKnownAnilistListNames } from "@/store/anilist.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

function NotifyRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} />
      <span className="text-xs">{label}</span>
    </label>
  );
}

export default function SettingsNotifications() {
  const { t } = useI18n();
  const notificationsEnabled = useCell(settingsAtoms.notificationsEnabled);
  const anilistReleaseNotifications = useCell(settingsAtoms.anilistReleaseNotifications);
  const notifyNewEpisodes = useCell(settingsAtoms.notifyNewEpisodes);
  const notifyStatusChanges = useCell(settingsAtoms.notifyStatusChanges);
  const notifyMediaStatus = useCell(settingsAtoms.notifyMediaStatus);
  const notifySubscribedReplies = useCell(settingsAtoms.notifySubscribedReplies);
  const notifyMediaMerge = useCell(settingsAtoms.notifyMediaMerge);
  const notifySequel = useCell(settingsAtoms.notifySequel);
  const anilistPollIntervalMin = useCell(settingsAtoms.anilistPollIntervalMin);
  const anilistNotifyLists = useCell(settingsAtoms.anilistNotifyLists);
  const notifyNewFiles = useCell(settingsAtoms.notifyNewFiles);
  const notifyTorrentHealth = useCell(settingsAtoms.notifyTorrentHealth);
  const notifyUpscaleDone = useCell(settingsAtoms.notifyUpscaleDone);
  const notifyModelDownloads = useCell(settingsAtoms.notifyModelDownloads);
  const notifyBackup = useCell(settingsAtoms.notifyBackup);
  const notifyUpdateAvailable = useCell(settingsAtoms.notifyUpdateAvailable);
  const notifyScanErrors = useCell(settingsAtoms.notifyScanErrors);
  const knownListNames = useCell(anilistNotificationsAtoms.knownListNames);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsFailed, setListsFailed] = useState(false);

  const fetchLists = useCallback(async () => {
    setListsLoading(true);
    setListsFailed(false);
    const [user, authError] = await attempt(anilistApi.checkAuth());
    if (authError || !user) {
      setListsFailed(true);
      setListsLoading(false);
      return;
    }
    const [, listsError] = await attempt(
      (async () => {
        const lists = await anilistApi.getLists(user.id, true);
        setKnownAnilistListNames(lists.map((list) => list.name));
      })()
    );
    if (listsError) setListsFailed(true);
    setListsLoading(false);
  }, []);

  useEffect(() => {
    if (anilistNotificationsAtoms.knownListNames.get().length === 0) {
      fetchLists();
    }
  }, [fetchLists]);

  const toggleList = (name: string) => {
    const current = anilistNotifyLists ?? knownListNames;
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
    patchSettings({ anilistNotifyLists: next.length === knownListNames.length ? null : next });
  };

  const anilistOff = !anilistReleaseNotifications;

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.notifications.system")}</span>
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("common.on")}
            checked={notificationsEnabled}
            onChange={(v) => patchSettings({ notificationsEnabled: v })}
          />
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.anilist")}
          </span>
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
                onClick={fetchLists}
                disabled={listsLoading}
              >
                <RefreshCw className="size-3" />
              </Button>
              {listsLoading && (
                <span className="text-hint text-[12px]">{`${t("common.loading")}…`}</span>
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

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.torrents")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.notifications.torrent.health")}
            checked={notifyTorrentHealth}
            onChange={(v) => patchSettings({ notifyTorrentHealth: v })}
          />
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.player")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.notifications.newfiles")}
            checked={notifyNewFiles}
            onChange={(v) => patchSettings({ notifyNewFiles: v })}
          />
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">
            {t("settings.notifications.group.tasks")}
          </span>
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

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.notifications.group.app")}</span>
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NotifyRow
            label={t("settings.notifications.update")}
            checked={notifyUpdateAvailable}
            onChange={(v) => patchSettings({ notifyUpdateAvailable: v })}
          />
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
