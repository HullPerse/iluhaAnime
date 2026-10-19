import { useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { confirm, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Download, Check, ChevronRight, RefreshCw, ScrollText, X } from "lucide-react";
import { useState } from "react";

import { sqliteApi } from "@/api/sqlite.api";
import { systemApi } from "@/api/system.api";
import { Button } from "@/components/ui/button.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { resetCoverCache } from "@/hooks/collection/cache.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { resetRemoteImageCache } from "@/hooks/remoteImage.hook";
import { useUpdateCheck } from "@/hooks/update.hook";
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
import { showError, showInfo, showWarning } from "@/lib/utils/notification.utils";
import { buildReproFrontend } from "@/lib/utils/repro.utils";
import { searchAtoms } from "@/store/search.store";
import { getSettingsSnapshot, patchSettings, settingsAtoms } from "@/store/settings.store";
import type { SettingsTab } from "@/types/settings";
import type { SqliteBackupInfo, SqliteDatabaseInfo } from "@/types/sqlite";

import { SummaryButton, SummaryRow, SummarySection } from "./summaryRow.settings";

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
  const isOnline = useOnlineStatus();
  const historyCount = useCell(searchAtoms.history).length;
  const queryStatCount = Object.keys(useCell(searchAtoms.queryStats)).length;
  const indexCount = useCell(searchAtoms.animeIndex).length;
  const sqliteBrowserEnabled = useCell(settingsAtoms.sqliteBrowserEnabled);
  const { data: update, isFetching: checkingUpdate, check } = useUpdateCheck();

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

  const refreshSummary = () => {
    queryClient.invalidateQueries({ queryKey: STORAGE_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: queryKeys.summaryFfprobe() });
  };

  const runUpdateCheck = async () => {
    const outcome = await check();
    if (outcome.status === "none") {
      showInfo(t("updater.title"), t("updater.check.none"));
      return;
    }
    if (outcome.status === "offline") {
      showWarning(t("network.offline.title"), t("network.action.unavailable"));
      return;
    }
    if (outcome.status === "error") {
      showError(t("updater.check.error"), outcome.error.message);
    }
  };

  const handleCheck = () => {
    runUpdateCheck().catch((error) => reportBackgroundError("summary.update.check", error));
  };

  const collectRepro = async () => {
    const [target, dialogError] = await attempt(
      saveDialog({
        defaultPath: "iluha-repro.zip",
        filters: [{ extensions: ["zip"], name: "Zip" }],
      })
    );
    if (dialogError !== null || !target) return;
    setCollecting(true);
    const [, collectError] = await attempt(
      (async () => {
        const [version] = await attempt(getVersion());
        const frontend = buildReproFrontend({
          counts: { animeIndex: indexCount, history: historyCount, queryStats: queryStatCount },
          settings: getSettingsSnapshot(),
          version: version ?? "?",
        });
        return systemApi.collectReproBundle(frontend, target);
      })()
    );
    setCollecting(false);
    if (collectError !== null) {
      showError(t("settings.summary.repro.error"), collectError.message);
    }
  };

  const handleCollectRepro = () => {
    collectRepro().catch((error) => reportBackgroundError("summary.repro.collect", error));
  };

  const updateActionLabel = update ? t("updater.update") : t("updater.check");
  const updateActionTitle = update
    ? t("updater.check.available", { version: update.version })
    : t("updater.check");
  const ffmpegValue =
    ffmpeg.data === undefined ? (
      "..."
    ) : ffmpeg.data ? (
      <span className="inline-flex items-center gap-1">
        <Check className="text-success size-3" aria-hidden />
        {t("settings.summary.ffmpeg.installed")}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1">
        <X className="text-destructive size-3" aria-hidden />
        {t("settings.summary.ffmpeg.missing")}
      </span>
    );

  return (
    <div className="ui-panel flex w-72 shrink-0 flex-col gap-2 overflow-y-auto p-2">
      <div className="flex flex-row items-center gap-1">
        <span className="windows95-text flex-1 text-xs font-bold">
          {t("settings.summary.title")}
        </span>
        <Button
          size="icon"
          className="size-5 shrink-0"
          title={t("settings.summary.refresh")}
          aria-label={t("settings.summary.refresh")}
          loading={storage.isFetching || ffmpeg.isFetching}
          onClick={refreshSummary}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>

      <SummarySection title={t("settings.summary.app")}>
        <SummaryRow
          label={t("settings.summary.app.version")}
          value={version.data ?? "..."}
          busy={version.data === undefined}
          actionLabel={updateActionLabel}
          actionTitle={updateActionTitle}
          onAction={handleCheck}
          actionLoading={checkingUpdate}
          actionDisabled={!isOnline}
        />
        <SummaryRow
          label={t("settings.summary.ffmpeg")}
          value={ffmpegValue}
          busy={ffmpeg.data === undefined}
        />
      </SummarySection>

      <SummarySection title={t("settings.summary.storage")}>
        <SummaryRow
          label={t("settings.summary.database")}
          value={
            data === undefined ? "..." : data.database === null ? unknown : data.database.fileName
          }
          hint={data?.database ? formatBytes(data.database.sizeBytes) : undefined}
          busy={data === undefined}
          actionLabel={t("settings.summary.open")}
          actionIcon={<ChevronRight className="size-3" />}
          onAction={openSqlite}
        />
        <SummaryRow
          label={t("settings.summary.backups")}
          value={
            data === undefined
              ? "..."
              : newestBackup === null
                ? t("settings.summary.none")
                : `${data.backups.length} - ${formatBytes(backupSize(data.backups))}`
          }
          hint={newestBackup === null ? undefined : formatBackupDate(newestBackup.modifiedMs)}
          busy={data === undefined}
          actionLabel={t("settings.summary.open")}
          actionIcon={<ChevronRight className="size-3" />}
          onAction={openSqlite}
        />
        <SummaryRow
          label={t("settings.summary.images")}
          value={
            data === undefined ? "..." : `${data.images.count} - ${formatBytes(data.images.bytes)}`
          }
          busy={data === undefined}
          actionLabel={t("settings.summary.images.clear")}
          onAction={handleClearImages}
        />
      </SummarySection>

      <SummarySection title={t("settings.summary.help")}>
        <SummaryButton
          label={t("settings.summary.repro")}
          title={t("settings.summary.repro.hint")}
          icon={<Download className="size-3" aria-hidden />}
          onClick={handleCollectRepro}
          busy={collecting}
        />
        <SummaryButton
          label={t("settings.changelog")}
          icon={<ScrollText className="size-3" aria-hidden />}
          onClick={() => onJump("changelog")}
        />
      </SummarySection>
    </div>
  );
}
