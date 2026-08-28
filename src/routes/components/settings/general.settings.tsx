import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
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
    collectionTabEnabled,
    tmdbApiKey,
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
            {
              value: "github-mirror",
              label: t("settings.ffmpegSource.mirror"),
            },
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

      <hr className="border-muted my-1 w-full border-t" />

      <div className="windows95-text flex flex-col gap-1">
        <span className="text-xs font-bold">{t("settings.sqliteBrowser")}</span>
        <span className="text-xs">
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

      <hr className="border-muted my-1 w-full border-t" />

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-xs font-bold">
          {t("settings.tmdbApiKey")}
        </span>
        <span className="windows95-text text-xs">
          {t("settings.tmdbApiKeyDescription")}
        </span>
        <Input
          value={tmdbApiKey ?? ""}
          onChange={(e) => patch({ tmdbApiKey: e.target.value.trim() || null })}
          placeholder={t("settings.tmdbApiKeyPlaceholder")}
          spellCheck={false}
          className="w-full max-w-130"
          aria-label={t("settings.tmdbApiKey")}
        />
      </div>

      <hr className="border-muted my-1 w-full border-t" />

      <div className="windows95-text flex flex-col gap-1">
        <span>{t("settings.tabs")}:</span>

        <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={collectionTabEnabled}
            onChange={(v) => patch({ collectionTabEnabled: v })}
          />
          <span title={t("settings.collectionTabDescription")}>
            {t("settings.collectionTab")}
          </span>
        </label>

        <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={vaultTabEnabled}
            onChange={(v) => patch({ vaultTabEnabled: v })}
          />
          <span title={t("settings.vaultTabDescription")}>
            {t("settings.vaultTab")}{" "}
            <span className="text-orange-400">{`[${t("settings.experimental")}]`}</span>
          </span>
        </label>
      </div>

      <hr className="border-muted my-1 w-full border-t" />

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-xs font-bold">
          {t("settings.resetData")}
        </span>
        <span className="windows95-text text-xs">
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
