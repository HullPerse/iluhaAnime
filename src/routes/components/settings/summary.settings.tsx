import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatBackupDate } from "@/lib/settings/backup.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSearchStore } from "@/store/search.store";
import type { SettingsTab } from "@/types/settings";
import type { SqliteBackupInfo, SqliteDatabaseInfo } from "@/types/sqlite";

function SummaryRow({
  label,
  value,
  actionLabel,
  onAction,
}: {
  label: string;
  value: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const handleAction = () => onAction?.();
  return (
    <div className="flex flex-row items-center gap-1 px-1">
      <span className="windows95-text text-hint w-24 shrink-0 text-xs">{label}</span>
      <span
        className="windows95-text min-w-0 flex-1 truncate text-xs"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
      {actionLabel && onAction ? (
        <Button className="h-5 shrink-0 px-1 text-xs" onClick={handleAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
export function SettingsSummary({ onJump }: { onJump: (tab: SettingsTab) => void }) {
  const { t } = useI18n();
  const historyCount = useSearchStore((s) => s.history.length);
  const model = useQuery({
    queryKey: ["summary_fastembed"],
    queryFn: () => withFallback(invokeTyped<boolean>("check_fastembed"), false),
    staleTime: Infinity,
  });
  const ffmpeg = useQuery({
    queryKey: ["summary_ffprobe"],
    queryFn: () => withFallback(invokeTyped<boolean>("check_ffprobe"), false),
    staleTime: Infinity,
  });
  const version = useQuery({
    queryKey: ["summary_version"],
    queryFn: () => withFallback(getVersion(), "?"),
    staleTime: Infinity,
  });
  const backup = useQuery({
    queryKey: ["summary_backup"],
    queryFn: async () => {
      const databases = await withFallback(
        invokeTyped<SqliteDatabaseInfo[]>("list_sqlite_databases"),
        []
      );
      const db = databases.find((d) => d.available) ?? databases[0];
      if (!db) return null;
      const list = await withFallback(
        invokeTyped<SqliteBackupInfo[]>("list_sqlite_backups", { database: db.id }),
        []
      );
      return list[0] ?? null;
    },
    staleTime: 60_000,
  });
  const text = (value: string | undefined, fallback: string) => value ?? fallback;
  return (
    <div className="ui-panel flex w-56 shrink-0 flex-col gap-1 overflow-y-auto p-1">
      <span className="windows95-text px-1 text-xs font-bold">{t("settings.summary.title")}</span>
      <SummaryRow label={`${t("settings.summary.app.version")}`} value={text(version.data, "?")} />
      <SummaryRow
        label={t("settings.summary.model")}
        value={
          model.data === undefined ? (
            "..."
          ) : model.data ? (
            <Check className="size-4 text-success" aria-label={t("player.fastembed.installed")} />
          ) : (
            <X className="size-4 text-destructive" aria-label={t("player.fastembed.missing")} />
          )
        }
        actionLabel={t("settings.summary.open")}
        onAction={() => onJump("search")}
      />
      <SummaryRow
        label="FFmpeg"
        value={
          ffmpeg.data === undefined ? (
            "..."
          ) : ffmpeg.data ? (
            <Check className="size-4 text-success" aria-label={t("player.fastembed.installed")} />
          ) : (
            <X className="size-4 text-destructive" aria-label={t("player.fastembed.missing")} />
          )
        }
      />
      <SummaryRow
        label={t("settings.summary.backup")}
        value={
          backup.data === undefined
            ? "..."
            : backup.data
              ? formatBackupDate(backup.data.modifiedMs)
              : t("settings.summary.none")
        }
        actionLabel={t("settings.summary.open")}
        onAction={() => onJump("sqlite")}
      />
      <SummaryRow
        label={t("settings.summary.learning")}
        value={`${historyCount}`}
        actionLabel={t("settings.summary.open")}
        onAction={() => onJump("search")}
      />
    </div>
  );
}
