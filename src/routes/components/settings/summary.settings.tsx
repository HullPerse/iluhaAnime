import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Check, RefreshCw, X } from "lucide-react";

import { sqliteApi } from "@/api/sqlite.api";
import { systemApi } from "@/api/system.api";
import { Button } from "@/components/ui/button.component";
import { THEMES } from "@/config/settings/themes.config";
import { resetCoverCache } from "@/hooks/collection/cache.hook";
import { resetRemoteImageCache } from "@/hooks/remoteImage.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatBackupDate } from "@/lib/settings/backup.utils";
import {
  attempt,
  attemptAll,
  reportBackgroundError,
  withFallback,
} from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { useThemeStore } from "@/store/theme.store";
import type { SettingsTab } from "@/types/settings";
import type { SqliteBackupInfo, SqliteDatabaseInfo } from "@/types/sqlite";

import { SummaryRow, SummarySection } from "./summaryRow.settings";

const STORAGE_QUERY_KEY = ["settings_summary_storage"];

interface RemoteImageStats {
  count: number;
  bytes: number;
}

interface SummaryStorage {
  database: SqliteDatabaseInfo | null;
  backups: SqliteBackupInfo[];
  images: RemoteImageStats;
}

function pickDatabase(databases: SqliteDatabaseInfo[]): SqliteDatabaseInfo | null {
  return databases.find((database) => database.available) ?? databases[0] ?? null;
}

function backupSize(backups: SqliteBackupInfo[]): number {
  return backups.reduce((total, backup) => total + backup.sizeBytes, 0);
}

export function SettingsSummary({ onJump }: { onJump: (tab: SettingsTab) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const historyCount = useSearchStore((s) => s.history.length);
  const queryStatCount = useSearchStore((s) => Object.keys(s.queryStats).length);
  const indexCount = useSearchStore((s) => s.animeIndex.length);
  const searchType = useSettingsStore((s) => s.searchType);
  const sqliteBrowserEnabled = useSettingsStore((s) => s.sqliteBrowserEnabled);
  const patchSettings = useSettingsStore((s) => s.patch);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const customThemes = useThemeStore((s) => s.customThemes);

  const ffmpeg = useQuery({
    queryKey: ["summary_ffprobe"],
    queryFn: () => withFallback(systemApi.checkFfprobe(), false),
    staleTime: Infinity,
  });
  const version = useQuery({
    queryKey: ["summary_version"],
    queryFn: () => withFallback(getVersion(), "?"),
    staleTime: Infinity,
  });
  const storage = useQuery({
    queryKey: STORAGE_QUERY_KEY,
    queryFn: async (): Promise<SummaryStorage> => {
      const [databases, error] = await attempt(sqliteApi.listDatabases());
      const database = error === null ? pickDatabase(databases ?? []) : null;
      const backups =
        database === null
          ? []
          : ((await withFallback(sqliteApi.listBackups(database.id), [])) ?? []);
      const images = (await withFallback(systemApi.getRemoteImagesStats(), {
        bytes: 0,
        count: 0,
      })) ?? { bytes: 0, count: 0 };
      return { backups, database, images };
    },
    staleTime: 30_000,
  });

  const themeLabel =
    [...THEMES, ...customThemes].find((theme) => theme.name === currentTheme)?.label ??
    currentTheme;
  const searchLabel =
    searchType === "modern"
      ? t("settings.theme.search.modern")
      : t("settings.theme.search.default");
  const unknown = t("settings.summary.unknown");
  const data = storage.data;
  const newestBackup = data?.backups[0] ?? null;

  const openSqlite = () => {
    if (!sqliteBrowserEnabled) patchSettings({ sqliteBrowserEnabled: true });
    onJump("sqlite");
  };

  const clearImages = async () => {
    const ok = await confirm(t("settings.summary.images.confirm"));
    if (!ok) return;
    const error = await attemptAll([
      () => systemApi.clearRemoteImageCache(),
      () => {
        resetCoverCache();
        resetRemoteImageCache();
      },
      () => queryClient.invalidateQueries({ queryKey: STORAGE_QUERY_KEY }),
    ]);
    if (error !== null) reportBackgroundError("summary.images.clear", error);
  };

  const handleClearImages = () => {
    clearImages().catch((error) => reportBackgroundError("summary.images.clear", error));
  };

  return (
    <div className="ui-panel flex w-64 shrink-0 flex-col gap-2 overflow-y-auto p-2">
      <div className="flex flex-row items-center gap-1">
        <span className="windows95-text flex-1 text-xs font-bold">
          {t("settings.summary.title")}
        </span>
        <Button
          size="icon"
          className="size-5 shrink-0"
          title={t("settings.summary.refresh")}
          aria-label={t("settings.summary.refresh")}
          onClick={() => queryClient.invalidateQueries({ queryKey: STORAGE_QUERY_KEY })}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>

      <SummarySection title={t("settings.summary.app")}>
        <SummaryRow
          label={t("settings.summary.app.version")}
          value={version.data ?? "..."}
          busy={version.data === undefined}
        />
        <SummaryRow
          label={t("settings.summary.theme")}
          value={themeLabel}
          actionLabel={t("settings.summary.open")}
          onAction={() => onJump("theme")}
        />
        <SummaryRow
          label={t("settings.summary.search")}
          value={searchLabel}
          actionLabel={t("settings.summary.open")}
          onAction={() => onJump("theme")}
        />
        <SummaryRow
          label={t("settings.summary.binaries")}
          value={
            ffmpeg.data === undefined ? (
              "..."
            ) : ffmpeg.data ? (
              <Check className="text-success size-4" aria-label={t("player.ffmpeg.installed")} />
            ) : (
              <X className="text-destructive size-4" aria-label={t("player.ffmpeg.missing")} />
            )
          }
          busy={ffmpeg.data === undefined}
        />
      </SummarySection>

      <SummarySection title={t("settings.summary.storage")}>
        <SummaryRow
          label={t("settings.summary.database")}
          value={
            data === undefined
              ? "..."
              : data.database === null
                ? unknown
                : `${data.database.fileName} · ${formatBytes(data.database.sizeBytes)}`
          }
          busy={data === undefined}
          actionLabel={t("settings.summary.open")}
          onAction={openSqlite}
        />
        <SummaryRow
          label={t("settings.summary.backups")}
          value={
            data === undefined
              ? "..."
              : newestBackup === null
                ? t("settings.summary.none")
                : `${data.backups.length} · ${formatBytes(backupSize(data.backups))} · ${formatBackupDate(newestBackup.modifiedMs)}`
          }
          busy={data === undefined}
          actionLabel={t("settings.summary.open")}
          onAction={openSqlite}
        />
        <SummaryRow
          label={t("settings.summary.images")}
          value={
            data === undefined ? "..." : `${data.images.count} · ${formatBytes(data.images.bytes)}`
          }
          busy={data === undefined}
          actionLabel={t("settings.summary.images.clear")}
          onAction={handleClearImages}
        />
      </SummarySection>

      <SummarySection title={t("settings.summary.learning")}>
        <SummaryRow
          label={t("settings.summary.history")}
          value={`${historyCount}`}
          actionLabel={t("settings.summary.open")}
          onAction={() => onJump("search")}
        />
        <SummaryRow label={t("settings.summary.queries")} value={`${queryStatCount}`} />
        <SummaryRow label={t("settings.summary.index")} value={`${indexCount}`} />
      </SummarySection>
    </div>
  );
}
