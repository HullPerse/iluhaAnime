import type {
  SqliteBackupInfo,
  SqliteDatabaseInfo,
  SqliteRowsPage,
  SqliteTableInfo,
} from "@/types/sqlite";

import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

export interface SqliteApiConfig {
  transport?: ApiTransport;
}

export interface SqliteRowsQuery {
  page: number;
  pageSize: number;
  filter: string | null;
  orderColumn: string | null;
  orderDirection: string | null;
}

export class SqliteApi {
  private readonly transport: ApiTransport;

  constructor(config: SqliteApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return this.transport.call<T>(command, args);
  }

  listDatabases(): Promise<SqliteDatabaseInfo[]> {
    return this.call("list_sqlite_databases");
  }

  listTables(database: string): Promise<SqliteTableInfo[]> {
    return this.call("get_sqlite_tables", { database });
  }

  getRows(database: string, table: string, query: SqliteRowsQuery): Promise<SqliteRowsPage> {
    return this.call("get_sqlite_rows", { database, table, ...query });
  }

  runQuery(database: string, sql: string): Promise<SqliteRowsPage> {
    return this.call("run_sqlite_query", { database, sql });
  }

  writeExport(path: string, content: string): Promise<void> {
    return this.call("write_sqlite_export", { path, content });
  }

  deleteRows(database: string, table: string, keys: string[][]): Promise<void> {
    return this.call("delete_sqlite_rows", { database, table, keys });
  }

  deleteRow(database: string, table: string, keys: string[]): Promise<void> {
    return this.call("delete_sqlite_row", { database, table, keys });
  }

  getCell(database: string, table: string, column: string, keys: string[]): Promise<string | null> {
    return this.call("get_sqlite_cell", { database, table, column, keys });
  }

  getCellImage(
    database: string,
    table: string,
    column: string,
    keys: string[]
  ): Promise<string | null> {
    return this.call("get_sqlite_cell_image", { database, table, column, keys });
  }

  updateCell(
    database: string,
    table: string,
    column: string,
    keys: string[],
    value: string
  ): Promise<void> {
    return this.call("update_sqlite_cell", { database, table, column, keys, value });
  }

  listBackups(database: string): Promise<SqliteBackupInfo[]> {
    return this.call("list_sqlite_backups", { database });
  }

  backupDatabase(database: string, keep = 5): Promise<SqliteBackupInfo> {
    return this.call("backup_sqlite_database", { database, keep });
  }

  vacuumDatabase(database: string): Promise<SqliteBackupInfo> {
    return this.call("vacuum_sqlite_database", { database });
  }

  restoreBackup(database: string, name: string): Promise<void> {
    return this.call("restore_sqlite_backup", { database, name });
  }

  resetData(): Promise<string[]> {
    return this.call("reset_sqlite_data");
  }
}

export const sqliteApi = new SqliteApi();
