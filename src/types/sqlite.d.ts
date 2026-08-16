export interface SqliteDatabaseInfo {
  id: string;
  label: string;
  fileName: string;
  available: boolean;
  sizeBytes: number;
  tables: string[];
}

export interface SqliteColumnInfo {
  name: string;
  dataType: string;
  notNull: boolean;
  primaryKey: boolean;
}

export interface SqliteTableInfo {
  name: string;
  rowCount: number;
  columns: SqliteColumnInfo[];
}

export interface SqliteRowsPage {
  database: string;
  table: string;
  columns: string[];
  rows: Array<unknown>[];
  total: number;
  page: number;
  pageSize: number;
}
