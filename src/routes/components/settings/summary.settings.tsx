import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { confirm, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Check, RefreshCw, X } from "lucide-react";

import { sqliteApi } from "@/api/sqlite.api";
import { systemApi } from "@/api/system.api";
import { Button } from "@/components/ui/button.component";
import { THEMES } from "@/config/settings/themes.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { resetCoverCache } from "@/hooks/collection/cache.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { resetRemoteImageCache } from "@/hooks/remoteImage.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { formatBackupDate } from "@/lib/settings/backup.utils";
import { useCell } from "@/lib/state/signal.hook";
import {
  attempt,
  attemptAll,
  reportBackgroundError,
  withFallback,
} from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { showError, showInfo } from "@/lib/utils/notification.utils";
import { buildReproFrontend } from "@/lib/utils/repro.utils";
import { searchAtoms } from "@/store/search.store";
import { getSettingsSnapshot, patchSettings, settingsAtoms } from "@/store/settings.store";
import { themeAtoms } from "@/store/theme.store";
import type { SettingsTab } from "@/types/settings";
import type { SqliteBackupInfo, SqliteDatabaseInfo } from "@/types/sqlite";

import { SummaryRow, SummarySection } from "./summaryRow.settings";

const STORAGE_QUERY_KEY = queryKeys.summaryStorage();

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
  const historyCount = useCell(searchAtoms.history).length;
  const queryStatCount = Object.keys(useCell(searchAtoms.queryStats)).length;
  const indexCount = useCell(searchAtoms.animeIndex).length;
  const searchType = useCell(settingsAtoms.searchType);
  const sqliteBrowserEnabled = useCell(settingsAtoms.sqliteBrowserEnabled);
  const currentTheme = useCell(themeAtoms.currentTheme);
  const customThemes = useCell(themeAtoms.customThemes);

  const ffmpeg = useAppQuery("static", {
    queryKey: queryKeys.summaryFfprobe(),
    queryFn: () => withFallback(systemApi.checkFfprobe(), false),
  });
  const version = useAppQuery("static", {
    queryKey: queryKeys.summaryVersion(),
    queryFn: () => withFallback(getVersion(), "?"),
  });
  const storage = useAppQuery("slow", {
    queryKey: queryKeys.summaryStorage(),
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
  const [collecting, setCollecting] = useState(false);

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

  const collectRepro = async () => {
    const [target, dialogError] = await attempt(
      saveDialog({ defaultPath: "iluha-repro.zip", filters: [{ extensions: ["zip"], name: "Zip" }] })
    );
    if (dialogError !== null || !target) return;
    setCollecting(true);
    const [saved, collectError] = await attempt((async () => {
      const [version] = await attempt(getVersion());
      const frontend = buildReproFrontend({
        counts: { animeIndex: indexCount, history: historyCount, queryStats: queryStatCount },
        settings: getSettingsSnapshot(),
        version: version ?? "?",
      });
      return systemApi.collectReproBundle(frontend, target);
    })());
    setCollecting(false);
    if (collectError !== null) {
      showError(t("settings.summary.repro.error"), collectError.message);
      return;
    }
    showInfo(t("settings.summary.repro.done"), saved);
  };

  const handleCollectRepro = () => {
    collectRepro().catch((error) => reportBackgroundError("summary.repro.collect", error));
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
        <SummaryRow
          label={t("settings.summary.repro")}
          value={t("settings.summary.repro.hint")}
          busy={collecting}
          actionLabel={t("settings.summary.repro.save")}
          onAction={handleCollectRepro}
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
