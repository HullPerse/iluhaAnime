import type { SqliteBackupInfo, SqliteDatabaseInfo } from "@/types/core/sqlite";

export function pickDatabase(databases: SqliteDatabaseInfo[]): SqliteDatabaseInfo | null {
  return databases.find((database) => database.available) ?? databases[0] ?? null;
}

export function backupSize(backups: SqliteBackupInfo[]): number {
  return backups.reduce((total, backup) => total + backup.sizeBytes, 0);
}

export function cacheRate(stats: { hits: number; misses: number }): number {
  const total = stats.hits + stats.misses;
  return total === 0 ? 0 : Math.round((stats.hits / total) * 100);
}
