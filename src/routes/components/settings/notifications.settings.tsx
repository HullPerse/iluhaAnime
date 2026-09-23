import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { POLL_INTERVALS_MIN } from "@/config/settings/notifications.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import { useSettingsStore } from "@/store/settings.store";

export default function SettingsNotifications() {
  const { t } = useI18n();
  const {
    notificationsEnabled,
    anilistReleaseNotifications,
    notifyNewEpisodes,
    notifyStatusChanges,
    anilistPollIntervalMin,
    anilistNotifyLists,
    patch,
  } = useSettingsStore();
  const knownListNames = useAniListNotificationsStore((s) => s.knownListNames);
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
        const lists = await anilistApi.getLists(user.id);
        useAniListNotificationsStore.getState().setKnownListNames(lists.map((list) => list.name));
      })()
    );
    if (listsError) setListsFailed(true);
    setListsLoading(false);
  }, []);

  useEffect(() => {
    if (useAniListNotificationsStore.getState().knownListNames.length === 0) {
      fetchLists();
    }
  }, [fetchLists]);

  const toggleList = (name: string) => {
    const current = anilistNotifyLists ?? knownListNames;
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
    patch({ anilistNotifyLists: next.length === knownListNames.length ? null : next });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.notifications")}</span>
        </div>
        <div className="p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.notifications.system")}
            </span>
            <div className="flex flex-col gap-0.5">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={notificationsEnabled}
                  onChange={(v) => patch({ notificationsEnabled: v })}
                />
                <span>{t("common.on")}</span>
              </label>
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.anilist.release.notifications")}
            </span>
            <div className="flex flex-col gap-0.5">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={anilistReleaseNotifications}
                  onChange={(v) => patch({ anilistReleaseNotifications: v })}
                />
                <span>{t("common.on")}</span>
              </label>
              <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={notifyNewEpisodes}
                  disabled={!anilistReleaseNotifications}
                  onChange={(v) => patch({ notifyNewEpisodes: v })}
                />
                <span className="text-xs">{t("settings.notifications.episodes")}</span>
              </label>
              <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={notifyStatusChanges}
                  disabled={!anilistReleaseNotifications}
                  onChange={(v) => patch({ notifyStatusChanges: v })}
                />
                <span className="text-xs">{t("settings.notifications.statuses")}</span>
              </label>
            </div>

            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.notifications.interval")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Select
                value={String(anilistPollIntervalMin)}
                disabled={!anilistReleaseNotifications}
                onChange={(v) => patch({ anilistPollIntervalMin: Number(v) })}
                options={POLL_INTERVALS_MIN.map((m) => ({
                  value: String(m),
                  label: `${m} ${t("settings.notifications.interval.min")}`,
                }))}
                className="w-32"
              />
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.notifications.lists")}
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
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
                <label
                  key={name}
                  className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
                >
                  <Checkbox
                    checked={anilistNotifyLists === null || anilistNotifyLists.includes(name)}
                    disabled={!anilistReleaseNotifications}
                    onChange={() => toggleList(name)}
                  />
                  <span className="text-xs">{name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
