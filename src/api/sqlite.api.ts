import type {
  SqliteBackupInfo,
  SqliteDatabaseInfo,
  SqliteRowsPage,
  SqliteTableInfo,
} from "@/types/core/sqlite";

import type { ApiTransport } from "@/types/core/transport";
import { tauriTransport } from "@/api/transport.api";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  SqliteBackupListSchema,
  SqliteBackupSchemaCompiled,
  SqliteDatabaseListSchema,
  SqliteRowsPageSchemaCompiled,
  SqliteTableListSchema,
} from "@/api/sqlite.schema";

interface SqliteApiConfig {
  transport?: ApiTransport;
}

interface SqliteRowsQuery {
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

  async listDatabases(): Promise<SqliteDatabaseInfo[]> {
    const databases = await this.call<SqliteDatabaseInfo[]>("list_sqlite_databases");
    assertSchema(databases, SqliteDatabaseListSchema);
    return databases;
  }

  async listTables(database: string): Promise<SqliteTableInfo[]> {
    const tables = await this.call<SqliteTableInfo[]>("get_sqlite_tables", { database });
    assertSchema(tables, SqliteTableListSchema);
    return tables;
  }

  async getRows(
    database: string,
    table: string,
    query: SqliteRowsQuery
  ): Promise<SqliteRowsPage> {
    const page = await this.call<SqliteRowsPage>("get_sqlite_rows", {
      database,
      table,
      ...query,
    });
    assertSchema(page, SqliteRowsPageSchemaCompiled);
    return page;
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

  async listBackups(database: string): Promise<SqliteBackupInfo[]> {
    const backups = await this.call<SqliteBackupInfo[]>("list_sqlite_backups", { database });
    assertSchema(backups, SqliteBackupListSchema);
    return backups;
  }

  async backupDatabase(database: string, keep = 5): Promise<SqliteBackupInfo> {
    const backup = await this.call<SqliteBackupInfo>("backup_sqlite_database", {
      database,
      keep,
    });
    assertSchema(backup, SqliteBackupSchemaCompiled);
    return backup;
  }

  async vacuumDatabase(database: string): Promise<SqliteBackupInfo> {
    const backup = await this.call<SqliteBackupInfo>("vacuum_sqlite_database", { database });
    assertSchema(backup, SqliteBackupSchemaCompiled);
    return backup;
  }

  restoreBackup(database: string, name: string): Promise<void> {
    return this.call("restore_sqlite_backup", { database, name });
  }

  resetData(): Promise<string[]> {
    return this.call("reset_sqlite_data");
  }
}

export const sqliteApi = new SqliteApi();
