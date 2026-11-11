import * as z from "zod/mini";

const SqliteDatabaseSchema = z.looseObject({
  id: z.string(),
  label: z.string(),
  fileName: z.string(),
  available: z.boolean(),
  sizeBytes: z.number(),
  tables: z.array(z.string()),
});

const SqliteColumnSchema = z.looseObject({
  name: z.string(),
  dataType: z.string(),
  notNull: z.boolean(),
  primaryKey: z.boolean(),
  isImage: z.boolean(),
});

const SqliteTableSchema = z.looseObject({
  name: z.string(),
  rowCount: z.number(),
  columns: z.array(SqliteColumnSchema),
});

const SqliteRowsPageSchema = z.looseObject({
  database: z.string(),
  table: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.unknown()),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

const SqliteBackupSchema = z.looseObject({
  name: z.string(),
  sizeBytes: z.number(),
  modifiedMs: z.number(),
});

export const SqliteDatabaseListSchema = z.compile(z.array(SqliteDatabaseSchema));
export const SqliteTableListSchema = z.compile(z.array(SqliteTableSchema));
export const SqliteRowsPageSchemaCompiled = z.compile(SqliteRowsPageSchema);
export const SqliteBackupSchemaCompiled = z.compile(SqliteBackupSchema);
export const SqliteBackupListSchema = z.compile(z.array(SqliteBackupSchema));
