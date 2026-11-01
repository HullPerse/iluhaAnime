import type { SqliteBackupInfo, SqliteDatabaseInfo } from "@/types/core/sqlite";

export function pickDatabase(databases: SqliteDatabaseInfo[]): SqliteDatabaseInfo | null {
  return databases.find((database) => database.available) ?? databases[0] ?? null;
}

export function backupSize(backups: SqliteBackupInfo[]): number {
  return backups.reduce((total, backup) => total + backup.sizeBytes, 0);
}
