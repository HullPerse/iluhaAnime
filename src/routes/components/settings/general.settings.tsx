import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";
import type { Locale } from "@/types";
import type { SettingsStore } from "@/types/settings";

export default function SettingsGeneral() {
  const {
    language,
    parseTitles,
    anilistReleaseNotifications,
    sqliteBrowserEnabled,
    vaultTabEnabled,
    ffmpegSource,
    patch,
  } = useSettingsStore();
  const { t } = useI18n();
  const [pendingClear, setPendingClear] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [pendingSqliteEnable, setPendingSqliteEnable] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.language")}</span>
        <Select
          value={language}
          onChange={(value) => patch({ language: value as Locale })}
          options={[
            { value: "ru", label: t("settings.language.ru") },
            { value: "en", label: t("settings.language.en") },
          ]}
          className="w-32"
        />
      </label>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.ffmpegSource")}</span>
        <Select
          value={ffmpegSource}
          onChange={(value) =>
            patch({ ffmpegSource: value as SettingsStore["ffmpegSource"] })
          }
          options={[
            {
              value: "essentials",
              label: t("settings.ffmpegSource.essentials"),
            },
            { value: "github", label: t("settings.ffmpegSource.github") },
            { value: "github-mirror", label: t("settings.ffmpegSource.mirror") },
          ]}
          className="w-52"
        />
      </label>


      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox
          checked={parseTitles}
          onChange={(v) => {
            patch({ parseTitles: v });
          }}
        />
        <span>
          {t("settings.parseTitles")} {t("settings.parseTitlesExample")}
        </span>
      </label>

      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox
          checked={anilistReleaseNotifications}
          onChange={(v) => patch({ anilistReleaseNotifications: v })}
        />
        <span>{t("settings.anilistReleaseNotifications")}</span>
      </label>

      <hr className="windows95-header w-full" />

      <div className="windows95-text flex flex-col gap-1">
        <span className="text-[10px] font-bold">
          {t("settings.sqliteBrowser")}
        </span>
        <span className="text-[9px]">
          {t("settings.sqliteBrowserDescription")}
        </span>
        <Button
          className="mt-1 w-fit"
          variant={sqliteBrowserEnabled ? "destructive" : "default"}
          onClick={() =>
            sqliteBrowserEnabled
              ? patch({ sqliteBrowserEnabled: false })
              : setPendingSqliteEnable(true)
          }
        >
          {sqliteBrowserEnabled
            ? t("settings.sqliteDisable")
            : t("settings.sqliteEnable")}
        </Button>
      </div>

      <hr className="windows95-header w-full" />

      <div className="windows95-text flex flex-col gap-1">
        <span className="text-[10px] font-bold">
          {t("settings.vaultTab")}{" "}
          <span className="text-[8px] font-normal text-orange-500">
            {t("settings.experimental")}
          </span>
        </span>
        <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={vaultTabEnabled}
            onChange={(v) => patch({ vaultTabEnabled: v })}
          />
          <span>{t("settings.vaultTabDescription")}</span>
        </label>
      </div>

      <hr className="windows95-header w-full" />

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-[10px] font-bold">
          {t("settings.resetData")}
        </span>
        <span className="windows95-text text-[9px]">
          {t("settings.resetDescription")}
        </span>
        <Button
          variant="destructive"
          className="mt-1 w-fit"
          onClick={() => {
            setResetError(null);
            setPendingClear(true);
          }}
        >
          {t("settings.resetButton")}
        </Button>
      </div>

      {pendingSqliteEnable && (
        <ConfirmDialog
          open
          title={t("settings.sqliteWarningTitle")}
          message={t("settings.sqliteWarningMessage")}
          confirmLabel={t("settings.sqliteEnable")}
          variant="destructive"
          onConfirm={() => {
            patch({ sqliteBrowserEnabled: true });
            setPendingSqliteEnable(false);
          }}
          onCancel={() => setPendingSqliteEnable(false)}
          onClose={() => setPendingSqliteEnable(false)}
        />
      )}

      {pendingClear && (
        <ConfirmDialog
          open
          title={t("settings.resetTitle")}
          message={resetError ?? t("settings.resetMessage")}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={async () => {
            try {
              await invoke("reset_sqlite_data");
              for (const key of [
                "settings",
                "searchState",
                "themeState",
                "lastSaveDir",
                "cache",
                "categories",
                "anilistFriends",
                "notifications",
              ]) {
                localStorage.removeItem(key);
              }
              window.location.reload();
            } catch (error: unknown) {
              setResetError(
                error instanceof Error ? error.message : String(error)
              );
            }
          }}
          onCancel={() => setPendingClear(false)}
          onClose={() => setPendingClear(false)}
        />
      )}
    </div>
  );
}
