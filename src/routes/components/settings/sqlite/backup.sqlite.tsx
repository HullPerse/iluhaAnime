import { useCallback, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatBackupDate, formatBackupSize } from "@/lib/settings/backup.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { SqliteBackupInfo } from "@/types/sqlite";

export function BackupPanel({
  database,
  databases,
  onSelectDatabase,
  onChanged,
}: {
  database: string;
  databases: Array<{ value: string; label: string }>;
  onSelectDatabase: (value: string) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [backups, setBackups] = useState<SqliteBackupInfo[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState(false);

  const refresh = useCallback(async () => {
    if (!database) {
      setBackups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await invokeTyped<SqliteBackupInfo[]>("list_sqlite_backups", { database });
      setBackups(result);
      setSelected((current) =>
        result.some((item) => item.name === current) ? current : (result[0]?.name ?? "")
      );
    } catch (cause: unknown) {
      setBackups([]);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [database]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runBackup = async () => {
    if (!database || working) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const created = await invokeTyped<SqliteBackupInfo>("backup_sqlite_database", {
        database,
        keep: 5,
      });
      setNotice(t("settings.sqlite.backup.done", { name: created.name }));
      await refresh();
      onChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  };

  const runVacuum = async () => {
    if (!database || working) return;
    setWorking(true);
    setError(null);
    setNotice(null);

    try {
      const safety = await invokeTyped<SqliteBackupInfo>("vacuum_sqlite_database", { database });
      setNotice(t("settings.sqlite.backup.vacuum.done", { name: safety.name }));
      await refresh();
      onChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  };

  const runRestore = async () => {
    if (!database || !selected || working) return;
    setPendingRestore(false);
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await invokeTyped("restore_sqlite_backup", { database, name: selected });
      setNotice(t("settings.sqlite.backup.restored"));
      await refresh();
      onChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="ui-toolbar">
        <label className="windows95-text flex items-center gap-1 text-xs">
          {t("settings.sqlite.database")}
          <select
            className="windows95-small-border bg-white px-1 py-0.5"
            value={database}
            onChange={(event) => onSelectDatabase(event.target.value)}
            disabled={working}
            aria-label={t("settings.sqlite.database")}
          >
            {databases.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={runBackup} disabled={!database || working}>
          {t("settings.sqlite.backup.now")}
        </Button>
        <Button
          onClick={() => setPendingRestore(true)}
          disabled={!database || !selected || working}
          variant="secondary"
        >
          {t("settings.sqlite.backup.restore")}
        </Button>
        <Button onClick={runVacuum} disabled={!database || working} variant="secondary">
          {t("settings.sqlite.backup.compact")}
        </Button>
        <Button onClick={refresh} disabled={loading || working} variant="secondary">
          {t("settings.sqlite.refresh")}
        </Button>
      </div>

      {backups.length > 0 && (
        <span className="windows95-text text-hint text-xs">
          {t("settings.sqlite.backup.last", {
            when: formatBackupDate(backups[0]?.modifiedMs ?? 0),
          })}
        </span>
      )}

      {loading ? (
        <span className="windows95-text text-xs">{t("common.loading")}</span>
      ) : (
        backups.length > 0 && (
          <ul className="windows95-border flex max-h-56 flex-col gap-1 overflow-auto bg-white p-1">
            {backups.map((backup) => (
              <li key={backup.name}>
                <label className="grid cursor-pointer grid-cols-[auto_1fr_80px] items-center gap-2 px-1 py-0.5 select-none">
                  <input
                    type="radio"
                    name="sqlite-backup"
                    checked={selected === backup.name}
                    onChange={() => setSelected(backup.name)}
                    disabled={working}
                  />
                  <span className="windows95-text truncate text-xs font-bold" title={backup.name}>
                    {backup.name}
                  </span>
                  <span className="windows95-text text-hint text-right text-xs">
                    {formatBackupSize(backup.sizeBytes)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )
      )}

      <span className="windows95-text text-hint text-xs">{t("settings.sqlite.backup.hint")}</span>
      {notice && <span className="windows95-text text-xs">{notice}</span>}
      {error && <span className="windows95-text text-destructive text-xs">{error}</span>}

      <ConfirmDialog
        open={pendingRestore}
        title={t("settings.sqlite.backup.restore.title")}
        message={t("settings.sqlite.backup.restore.message", { name: selected })}
        confirmLabel={t("settings.sqlite.backup.restore")}
        variant="destructive"
        onConfirm={runRestore}
        onCancel={() => setPendingRestore(false)}
      />
    </section>
  );
}
