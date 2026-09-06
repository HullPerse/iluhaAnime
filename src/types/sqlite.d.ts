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

export interface SqliteBackupInfo {
  name: string;
  sizeBytes: number;
  modifiedMs: number;
}

export type SortState = { column: string; direction: "asc" | "desc" } | null;

export type RowsTableProps = {
  columns: string[];
  rowsArray: Array<unknown>[];
  interactive: boolean;
  primaryKeys: string[];
  selectedRows: Record<string, string[]>;
  sort: SortState;
  blobColumns: Set<string>;
  showImages: boolean;
  deleting: boolean;
  selectedDatabase: string;
  selectedTable: string;
  primaryKeyValues: (row: unknown[]) => string[] | null;
  toggleAllRows: (rows: Array<unknown>[]) => void;
  toggleSort: (column: string) => void;
  toggleRowSelection: (keys: string[] | null) => void;
  openCell: (row: unknown[], column: string) => void;
  setPendingDelete: (keys: string[]) => void;
  hideId: boolean;
  baseIndex: number;
};
