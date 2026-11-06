import { useState } from "react";

import { sqliteApi } from "@/api/sqlite.api";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { useI18n } from "@/hooks/i18n.hook";
import { applyWindowChrome } from "@/lib/core/system/window.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { attempt, attemptSync } from "@hullperse/hp_utils/attempt";
import { useUserAnilistData } from "@/routes/components/anilist/user/data.user";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import SettingsMedia from "@/routes/components/settings/media.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";
import ScreenshotSettings from "@/routes/components/settings/screenshot.settings";
import { KeyboardSettings } from "@/routes/components/settings/keyboard.settings";
import { StreamTabNote } from "@/routes/components/settings/streamTabNote.settings";

export default function SettingsGeneral() {
  const language = useCell(settingsAtoms.language);
  const discordRpcEnabled = useCell(settingsAtoms.discordRpcEnabled);
  const parseTitlesPlayer = useCell(settingsAtoms.parseTitlesPlayer);
  const parseTitlesTorrent = useCell(settingsAtoms.parseTitlesTorrent);
  const parseTitlesSearch = useCell(settingsAtoms.parseTitlesSearch);
  const coverMode = useCell(settingsAtoms.torrentCoverMode);
  const { user: anilistUser } = useUserAnilistData();
  const sqliteBrowserEnabled = useCell(settingsAtoms.sqliteBrowserEnabled);
  const collectionTabEnabled = useCell(settingsAtoms.collectionTabEnabled);
  const anilistTabEnabled = useCell(settingsAtoms.anilistTabEnabled);
  const streamTabEnabled = useCell(settingsAtoms.streamTabEnabled);
  const minimizeToTray = useCell(settingsAtoms.minimizeToTray);
  const fastLaunch = useCell(settingsAtoms.fastLaunch);
  const rememberLastTab = useCell(settingsAtoms.rememberLastTab);
  const ffmpegSource = useCell(settingsAtoms.ffmpegSource);
  const { t } = useI18n();
  const [pendingClear, setPendingClear] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel" data-find-section="general.language">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.language")}</span>
          <SectionResetButton sectionId="general.language" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.language")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Select
                value={language}
                onChange={(value) => patchSettings({ language: value })}
                options={[
                  { value: "ru", label: t("settings.language.ru") },
                  { value: "en", label: t("settings.language.en") },
                ]}
                className="w-32"
              />
            </div>

            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.ffmpeg.source")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Select
                value={ffmpegSource}
                onChange={(value) => patchSettings({ ffmpegSource: value })}
                options={[
                  {
                    value: "essentials",
                    label: t("settings.ffmpeg.source.essentials"),
                  },
                  { value: "github", label: t("settings.ffmpeg.source.github") },
                  {
                    value: "github-mirror",
                    label: t("settings.ffmpeg.source.mirror"),
                  },
                ]}
                className="w-52"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="general.tabs">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.tabs")}</span>
          <SectionResetButton sectionId="general.tabs" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 min-[560px]:grid-cols-[140px_1fr]">
            <span />
            <div className="flex flex-col gap-4">
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                  <Checkbox
                    checked={collectionTabEnabled}
                    onChange={(v) => patchSettings({ collectionTabEnabled: v })}
                  />
                  <span className="text-xs">{t("settings.collection.tab")}</span>
                </label>
              </div>
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                  <Checkbox
                    checked={anilistTabEnabled}
                    onChange={(v) => patchSettings({ anilistTabEnabled: v })}
                  />
                  <span className="text-xs">{t("settings.anilist.tab")}</span>
                </label>
              </div>
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                  <Checkbox
                    checked={streamTabEnabled}
                    onChange={(v) => patchSettings({ streamTabEnabled: v })}
                  />
                  <span className="text-xs">{t("settings.stream.tab")}</span>
                  <StreamTabNote />
                </label>
              </div>
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                  <Checkbox
                    checked={sqliteBrowserEnabled}
                    onChange={(v) => patchSettings({ sqliteBrowserEnabled: v })}
                  />
                  <span className="text-xs">{t("settings.sqlite")}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="general.startup">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.startup")}</span>
          <SectionResetButton sectionId="general.startup" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 min-[560px]:grid-cols-[140px_1fr]">
            <span />
            <div className="flex flex-col gap-4">
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                  <Checkbox
                    checked={fastLaunch}
                    onChange={(v) => patchSettings({ fastLaunch: v })}
                  />
                  <span className="text-xs">{t("settings.startup.fastLaunch")}</span>
                </label>
              </div>
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                  <Checkbox
                    checked={rememberLastTab}
                    onChange={(v) => patchSettings({ rememberLastTab: v })}
                  />
                  <span className="text-xs">{t("settings.startup.rememberLastTab")}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <KeyboardSettings />

      <section className="ui-panel" data-find-section="general.window">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.window")}</span>
          <SectionResetButton sectionId="general.window" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.window")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                <Checkbox
                  checked={minimizeToTray}
                  onChange={(v) => patchSettings({ minimizeToTray: v })}
                />
                <span className="text-xs">{t("settings.tray.minimize")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <SettingsMedia />

      <ScreenshotSettings />

      <section className="ui-panel" data-find-section="general.parse">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.parse.titles")}</span>
          <SectionResetButton sectionId="general.parse" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.parse.titles")}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                  <Checkbox
                    checked={parseTitlesPlayer}
                    onChange={(v) => {
                      patchSettings({ parseTitlesPlayer: v });
                    }}
                  />
                  <span>{t("settings.parse.player")}</span>
                </label>
              </div>
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                  <Checkbox
                    checked={parseTitlesTorrent}
                    onChange={(v) => {
                      patchSettings({ parseTitlesTorrent: v });
                    }}
                  />
                  <span>{t("settings.parse.torrent")}</span>
                </label>
              </div>
              <div className="group flex items-center gap-1">
                <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                  <Checkbox
                    checked={parseTitlesSearch}
                    onChange={(v) => {
                      patchSettings({ parseTitlesSearch: v });
                    }}
                  />
                  <span>{t("settings.parse.search")}</span>
                </label>
              </div>
              <div className="group flex min-w-0 flex-col gap-0.5">
                <span className="windows95-text text-text text-xs">
                  {t("settings.torrent.covers")}
                </span>
                <div className="flex items-center gap-1">
                  <Select
                    value={coverMode}
                    onChange={(value) =>
                      patchSettings({
                        torrentCoverMode: value,
                        torrentCoverModeManual: true,
                      })
                    }
                    options={[
                      { value: "off", label: t("settings.torrent.covers.off") },
                      { value: "pages", label: t("settings.torrent.covers.pages") },
                      { value: "full", label: t("settings.torrent.covers.full") },
                    ]}
                    className="w-52"
                    label={t("settings.torrent.covers")}
                  />
                </div>
                {!anilistUser && (
                  <span className="text-hint text-xs">{t("settings.torrent.covers.login")}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel" data-find-section="general.rpc">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.rpc.title")}</span>
          <SectionResetButton sectionId="general.rpc" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.rpc.title")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={discordRpcEnabled}
                  onChange={(v) => {
                    patchSettings({ discordRpcEnabled: v });
                  }}
                />
                <span>{t("settings.rpc.enabled")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <div
        className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]"
        data-find-section="general.reset"
      >
        <span className="windows95-text text-destructive text-xs font-bold">
          {t("settings.reset.data")}
        </span>
        <div className="flex flex-col gap-1">
          <Button
            variant="destructive"
            className="w-fit"
            onClick={() => {
              setResetError(null);
              setPendingClear(true);
            }}
          >
            {t("settings.reset.button")}
          </Button>
        </div>
      </div>

      {pendingClear && (
        <ConfirmDialog
          open
          title={t("settings.reset.title")}
          message={resetError ?? t("settings.reset.message")}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={async () => {
            const [, error] = await attempt(sqliteApi.resetData());
            if (error) {
              setResetError(error.message);
              return;
            }
            attemptSync(() => {
              for (const key of [
                "settings",
                "searchState",
                "themeState",
                "lastSaveDir",
                "cache",
                "categories",
                "collection-ui",
                "anilistFriends",
                "anilistReleaseObservations",
                "notifications",
                "lobbyConnections",
                "sessionIdentity",
                "animeIndexSyncKey",
              ]) {
                localStorage.removeItem(key);
              }
            });
            await applyWindowChrome(DEFAULT_SETTINGS);
            window.location.reload();
          }}
          onCancel={() => setPendingClear(false)}
          onClose={() => setPendingClear(false)}
        />
      )}
    </div>
  );
}
