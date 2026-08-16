import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Database,
  Download,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Image from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { usePagination } from "@/hooks/pagination.hook";
import { useI18n } from "@/lib/i18n";
import { enterSubmit, modEnter } from "@/lib/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import { MAX_CELL_PREVIEW, PAGE_SIZE } from "@/config/sqlite.config";
import type {
  SqliteDatabaseInfo,
  SqliteRowsPage,
  SqliteTableInfo,
} from "@/types";

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function previewCell(value: unknown): string {
  const rendered = displayCell(value);
  return rendered.length > MAX_CELL_PREVIEW
    ? `${rendered.slice(0, MAX_CELL_PREVIEW)}…`
    : rendered;
}

const IMAGE_URL_RE =
  /^(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?|\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?|data:image\/[a-zA-Z.+-]+;base64,[A-Za-z0-9+/=]+)$/i;

function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE_URL_RE.test(value);
}

function BlobImageCell({
  database,
  table,
  column,
  keys,
  alt,
}: {
  database: string;
  table: string;
  column: string;
  keys: string[];
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "image" | "not-image">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setSrc(null);
    invoke<string | null>("get_sqlite_cell_blob", {
      database,
      table,
      column,
      keys,
    })
      .then((value) => {
        if (cancelled) return;
        if (value) {
          setSrc(value);
          setState("image");
        } else {
          setState("not-image");
        }
      })
      .catch(() => {
        if (!cancelled) setState("not-image");
      });
    return () => {
      cancelled = true;
    };
  }, [database, table, column, JSON.stringify(keys)]);

  if (state === "loading")
    return <span className="text-muted block text-[9px]">…</span>;
  if (state === "not-image" || !src)
    return <span className="text-muted block text-[9px]">[BLOB]</span>;
  return (
    <div className="windows95-border mx-auto size-16 shrink-0 overflow-hidden bg-white">
      <Image
        src={src}
        alt={alt}
        type="contain"
        className="h-full w-full"
      />
    </div>
  );
}

export default function SqliteSettings() {
  const { t } = useI18n();
  const showImages = useSettingsStore((s) => s.sqliteShowImages);
  const patchSettings = useSettingsStore((s) => s.patch);
  const [mode, setMode] = useState<"browse" | "query">("browse");
  const [databases, setDatabases] = useState<SqliteDatabaseInfo[]>([]);
  const [tables, setTables] = useState<SqliteTableInfo[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [rows, setRows] = useState<SqliteRowsPage | null>(null);
  const [filterInput, setFilterInput] = useState("");
  const [filter, setFilter] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{
    column: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, string[]>>(
    {}
  );
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const [querySql, setQuerySql] = useState("");
  const [queryResult, setQueryResult] = useState<SqliteRowsPage | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const queryHistoryRef = useRef<string[]>([]);
  const queryHistoryIndexRef = useRef(-1);

  const [selectedCell, setSelectedCell] = useState<{
    column: string;
    keys: string[] | null;
    display: string;
  } | null>(null);
  const [cellValue, setCellValue] = useState("");
  const [cellLoading, setCellLoading] = useState(false);
  const [cellEditing, setCellEditing] = useState(false);
  const [cellEdit, setCellEdit] = useState("");
  const [cellSaving, setCellSaving] = useState(false);
  const [cellCopied, setCellCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const [cellIsImage, setCellIsImage] = useState(false);

  const refreshDatabases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SqliteDatabaseInfo[]>(
        "list_sqlite_databases"
      );
      setDatabases(result);
      setSelectedDatabase(
        (current) =>
          current ||
          result.find((item) => item.available)?.id ||
          result[0]?.id ||
          ""
      );
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDatabases();
  }, [refreshDatabases]);

  useEffect(() => {
    if (!selectedDatabase) {
      setTables([]);
      setSelectedTable("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<SqliteTableInfo[]>("get_sqlite_tables", {
      database: selectedDatabase,
    })
      .then((result) => {
        if (cancelled) return;
        setTables(result);
        setSelectedTable((current) =>
          result.some((table) => table.name === current)
            ? current
            : result[0]?.name || ""
        );
        setPage(1);
        setSort(null);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDatabase]);

  const loadRows = useCallback(async () => {
    if (!selectedDatabase || !selectedTable) {
      setRows(null);
      return;
    }
    setLoadingRows(true);
    setError(null);
    try {
      const result = await invoke<SqliteRowsPage>("get_sqlite_rows", {
        database: selectedDatabase,
        table: selectedTable,
        page,
        pageSize: PAGE_SIZE,
        filter: filter || null,
        orderColumn: sort?.column ?? null,
        orderDirection: sort?.direction ?? null,
      });
      setRows(result);
      const nextTotalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > nextTotalPages) setPage(nextTotalPages);
    } catch (error: unknown) {
      setRows(null);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingRows(false);
    }
  }, [page, filter, selectedDatabase, selectedTable, sort]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const selectedTableInfo = tables.find(
    (table) => table.name === selectedTable
  );
  const primaryKeys = (selectedTableInfo?.columns ?? [])
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
  const { total, from, to, lastPage, setPage: setPaged } = usePagination(
    rows?.total ?? 0,
    PAGE_SIZE,
    page,
    setPage
  );

  // Serializes a row into the values of its primary-key columns, in the same
  // order as `primaryKeys`. Returns null when any PK value is unknown.
  const primaryKeyValues = (row: unknown[]): string[] | null => {
    if (!rows) return null;
    const values: string[] = [];
    for (const key of primaryKeys) {
      const index = rows.columns.indexOf(key);
      if (index === -1) return null;
      values.push(displayCell(row[index]));
    }
    return values;
  };
  const databaseOptions = useMemo(
    () =>
      databases.map((database) => ({
        value: database.id,
        label: `${database.label}${database.available ? "" : ` · ${t("settings.sqliteUnavailable")}`}`,
      })),
    [databases, t]
  );
  const tableOptions = useMemo(
    () =>
      tables.map((table) => ({
        value: table.name,
        label: `${table.name} (${table.rowCount})`,
      })),
    [tables]
  );

  const applyFilter = () => {
    setPage(1);
    setFilter(filterInput.trim());
  };

  const isTextColumn = (column: string) => {
    const type = (
      selectedTableInfo?.columns.find((item) => item.name === column)
        ?.dataType ?? ""
    ).toUpperCase();
    return !["INTEGER", "INT", "REAL", "NUMERIC", "FLOAT", "DOUBLE", "BLOB"].includes(
      type
    );
  };

  const filterableColumns = useMemo(
    () =>
      (selectedTableInfo?.columns ?? []).filter(
        (column) => column.dataType.toUpperCase() !== "BLOB"
      ),
    [selectedTableInfo]
  );

  // Clicking a column tag fills in the filter template and puts the caret
  // right after the operator so the user can start typing the value at once.
  const insertFilterTemplate = (column: string) => {
    const template = `${column} ${isTextColumn(column) ? "~" : "="} `;
    const current = filterInput.trim();
    const next = current ? `${current} && ${template}` : template;
    flushSync(() => setFilterInput(next));
    const input = filterInputRef.current;
    if (input) {
      input.focus();
      const end = next.length;
      input.setSelectionRange(end, end);
    }
  };

  const toggleSort = (column: string) => {
    setSort((current) => {
      if (current?.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
    setPage(1);
  };

  const runQuery = async () => {
    if (!selectedDatabase || !querySql.trim()) return;
    const trimmed = querySql.trim();
    const history = queryHistoryRef.current;
    if (history.at(-1) !== trimmed) {
      history.push(trimmed);
      if (history.length > 50) history.shift();
    }
    queryHistoryIndexRef.current = -1;
    setQueryLoading(true);
    setError(null);
    try {
      const result = await invoke<SqliteRowsPage>("run_sqlite_query", {
        database: selectedDatabase,
        sql: querySql,
      });
      setQueryResult(result);
    } catch (error: unknown) {
      setQueryResult(null);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setQueryLoading(false);
    }
  };

  const navigateQueryHistory = (direction: "up" | "down") => {
    const history = queryHistoryRef.current;
    if (history.length === 0) return;
    if (direction === "up") {
      const index =
        queryHistoryIndexRef.current === -1
          ? history.length - 1
          : Math.max(0, queryHistoryIndexRef.current - 1);
      queryHistoryIndexRef.current = index;
      setQuerySql(history.at(index) ?? "");
    } else {
      if (queryHistoryIndexRef.current === -1) return;
      const next = queryHistoryIndexRef.current + 1;
      if (next >= history.length) {
        queryHistoryIndexRef.current = -1;
        setQuerySql("");
      } else {
        queryHistoryIndexRef.current = next;
        setQuerySql(history.at(next) ?? "");
      }
    }
  };

  const exportRows = async (
    columns: string[],
    rowsArray: Array<unknown>[],
    name: string
  ) => {
    try {
      const path = await save({
        defaultPath: `${name}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("write_sqlite_export", {
        path,
        content: JSON.stringify({ columns, rows: rowsArray }, null, 2),
      });
      setError(null);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleRowSelection = (keys: string[] | null) => {
    if (!keys || keys.length === 0) return;
    const id = keys.join(" | ");
    setSelectedRows((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = keys;
      return next;
    });
  };

  const toggleAllRows = (rowsArray: Array<unknown>[]) => {
    const currentPageKeys = rowsArray
      .map((row) => primaryKeyValues(row))
      .filter((keys): keys is string[] => !!keys && keys.length > 0);
    setSelectedRows((current) => {
      const next = { ...current };
      const allSelected =
        currentPageKeys.length > 0 &&
        currentPageKeys.every((keys) => Boolean(next[keys.join(" | ")]));
      for (const keys of currentPageKeys) {
        const id = keys.join(" | ");
        if (allSelected) delete next[id];
        else next[id] = keys;
      }
      return next;
    });
  };

  const deleteBatch = async () => {
    const rowsToDelete = Object.values(selectedRows);
    if (
      !rowsToDelete.length ||
      !selectedDatabase ||
      !selectedTable ||
      deletingRef.current
    )
      return;
    deletingRef.current = true;
    setDeleting(true);
    setPendingBatchDelete(false);
    try {
      await invoke("delete_sqlite_rows", {
        database: selectedDatabase,
        table: selectedTable,
        keys: rowsToDelete,
      });
      setSelectedRows({});
      await loadRows();
      await refreshDatabases();
      const refreshedTables = await invoke<SqliteTableInfo[]>(
        "get_sqlite_tables",
        { database: selectedDatabase }
      );
      setTables(refreshedTables);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const openCell = async (row: unknown[], column: string) => {
    const keys = primaryKeyValues(row);
    const display = displayCell(
      row[rows?.columns.indexOf(column) ?? -1] as unknown
    );
    setSelectedCell({ column, keys, display });
    setCellValue(display);
    setCellEdit(display);
    setCellEditing(false);
    setCellCopied(false);
    setCellIsImage(false);
    if (copiedTimerRef.current !== null)
      window.clearTimeout(copiedTimerRef.current);
    if (!keys || !selectedDatabase || !selectedTable) return;
    setCellLoading(true);
    try {
      if (blobColumns.has(column)) {
        const blob = await invoke<string | null>("get_sqlite_cell_blob", {
          database: selectedDatabase,
          table: selectedTable,
          column,
          keys,
        });
        if (blob) {
          setCellValue(blob);
          setCellEdit(blob);
          setCellIsImage(true);
        }
      } else {
        const value = await invoke<string | null>("get_sqlite_cell", {
          database: selectedDatabase,
          table: selectedTable,
          column,
          keys,
        });
        const resolved = value ?? "NULL";
        setCellValue(resolved);
        setCellEdit(resolved);
        if (isImageUrl(resolved)) setCellIsImage(true);
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setCellLoading(false);
    }
  };

  const copyCell = async () => {
    if (!cellValue) return;
    try {
      await navigator.clipboard.writeText(cellValue);
      setCellCopied(true);
      if (copiedTimerRef.current !== null)
        window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(
        () => setCellCopied(false),
        1500
      );
    } catch {
      // Clipboard access can be denied; ignore silently.
    }
  };

  const saveCell = async () => {
    if (
      !selectedCell ||
      !selectedCell.keys ||
      !selectedDatabase ||
      !selectedTable ||
      cellSaving
    )
      return;
    setCellSaving(true);
    setError(null);
    try {
      await invoke("update_sqlite_cell", {
        database: selectedDatabase,
        table: selectedTable,
        column: selectedCell.column,
        keys: selectedCell.keys,
        value: cellEdit,
      });
      setSelectedCell(null);
      await loadRows();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setCellSaving(false);
    }
  };

  const deleteRow = async () => {
    if (
      !pendingDelete ||
      !selectedDatabase ||
      !selectedTable ||
      primaryKeys.length === 0 ||
      deletingRef.current
    )
      return;
    const keyToDelete = pendingDelete;
    deletingRef.current = true;
    setDeleting(true);
    setPendingDelete(null);
    try {
      await invoke("delete_sqlite_row", {
        database: selectedDatabase,
        table: selectedTable,
        keys: keyToDelete,
      });
      setPendingDelete(null);
      await loadRows();
      await refreshDatabases();
      const refreshedTables = await invoke<SqliteTableInfo[]>(
        "get_sqlite_tables",
        { database: selectedDatabase }
      );
      setTables(refreshedTables);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const cellColumnInfo = selectedTableInfo?.columns.find(
    (column) => column.name === selectedCell?.column
  );
  const cellIsBlob = cellColumnInfo?.dataType.toUpperCase() === "BLOB";
  const blobColumns = new Set(
    (selectedTableInfo?.columns ?? [])
      .filter((column) => column.dataType.toUpperCase() === "BLOB")
      .map((column) => column.name)
  );
  const canEditCell =
    !!selectedCell?.keys && !cellIsBlob && !cellLoading && !cellSaving;

  const renderRowsTable = (
    columns: string[],
    rowsArray: Array<unknown>[],
    interactive: boolean
  ) => (
    <table className="min-w-full border-collapse text-left text-[10px]">
      <thead className="bg-secondary sticky top-0 text-white">
        <tr>
          {interactive && primaryKeys.length > 0 && (
            <th className="w-8 border-r border-white/30 px-1 py-1 font-normal">
              <button
                type="button"
                className="flex items-center hover:cursor-pointer"
                title={t("settings.sqliteSelectAll")}
                onClick={() => toggleAllRows(rowsArray)}
              >
                {rowsArray.every(
                  (row) =>
                    !!selectedRows[primaryKeyValues(row)?.join(" | ") ?? ""]
                ) ? (
                  <Check className="size-3" />
                ) : (
                  <span className="block size-3 border border-white/60" />
                )}
              </button>
            </th>
          )}
          {columns.map((column) => (
            <th
              key={column}
              className="border-r border-white/30 px-1 py-1 font-normal"
            >
              {interactive ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-0.5 text-left hover:cursor-pointer"
                  title={
                    sort?.column === column
                      ? sort.direction === "asc"
                        ? t("settings.sqliteSortDesc")
                        : t("settings.sqliteSortAsc")
                      : t("settings.sqliteSortAsc")
                  }
                  onClick={() => toggleSort(column)}
                >
                  {column}
                  {sort?.column === column &&
                    (sort.direction === "asc" ? (
                      <ArrowUp className="size-2.5" />
                    ) : (
                      <ArrowDown className="size-2.5" />
                    ))}
                </button>
              ) : (
                column
              )}
            </th>
          ))}
          {interactive && (
            <th className="px-1 py-1 font-normal">
              {t("settings.sqliteActions")}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rowsArray.map((row, rowIndex) => {
          const rowKeys = interactive ? primaryKeyValues(row) : null;
          const rowId = rowKeys ? rowKeys.join(" | ") : `${rowIndex}`;
          const selected = interactive ? !!rowKeys && !!selectedRows[rowId] : false;
          return (
            <tr
              key={`${rowId}-${rowIndex}`}
              className={`${selected ? "bg-secondary/10" : ""} hover:bg-surface border-b border-black/10 align-top`}
            >
              {interactive && rowKeys && (
                <td className="px-1 py-1">
                  <button
                    type="button"
                    className="flex items-center hover:cursor-pointer"
                    onClick={() => toggleRowSelection(rowKeys)}
                    title={t("settings.sqliteSelectAll")}
                  >
                    {selected ? (
                      <Check className="size-3" />
                    ) : (
                      <span className="block size-3 border border-black/40" />
                    )}
                  </button>
                </td>
              )}
              {row.map((value, cellIndex) => {
                const rendered = displayCell(value);
                const preview = previewCell(value);
                const column = columns[cellIndex];
                const showBlobImage =
                  interactive && showImages && blobColumns.has(column);
                const showUrlImage =
                  interactive && showImages && isImageUrl(value);
                const cell = interactive ? (
                  <button
                    type="button"
                    className="block w-full text-left hover:cursor-pointer"
                    title={rendered}
                    onClick={() => openCell(row, column)}
                  >
                    {showBlobImage && rowKeys ? (
                      <BlobImageCell
                        database={selectedDatabase}
                        table={selectedTable}
                        column={column}
                        keys={rowKeys}
                        alt={`${column}`}
                      />
                    ) : showUrlImage ? (
                      <Image
                        src={value}
                        alt={column}
                        type="contain"
                        className="h-12 w-12 bg-white object-contain"
                      />
                    ) : (
                      preview
                    )}
                  </button>
                ) : (
                  preview
                );
                return (
                  <td
                    key={`${cellIndex}-${rowIndex}`}
                    className="max-w-72 max-h-20 overflow-hidden px-1 py-1 break-words whitespace-pre-wrap"
                  >
                    {cell}
                  </td>
                );
              })}
              {interactive && (
                <td className="px-1 py-1">
                  <Button
                    size="icon"
                    className="size-5"
                    title={t("settings.sqliteDeleteRow")}
                    onClick={() => setPendingDelete(rowKeys ?? [])}
                    disabled={!rowKeys || deleting}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <main className="windows95-text flex min-h-full flex-col gap-2 p-2">
      <header className="windows95-active-border bg-primary flex items-center gap-1 p-1">
        <Database className="size-4" />
        <strong>{t("settings.sqliteTitle")}</strong>
        <span className="text-muted text-[9px]">
          {t("settings.sqliteReadOnlyHint")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={mode === "browse" ? "outline" : "default"}
            className="h-5"
            onClick={() => setMode("browse")}
          >
            {t("settings.sqliteModeBrowse")}
          </Button>
          <Button
            variant={mode === "query" ? "outline" : "default"}
            className="h-5"
            onClick={() => setMode("query")}
          >
            {t("settings.sqliteModeQuery")}
          </Button>
          <Button
            size="icon"
            className="size-6"
            onClick={() => refreshDatabases()}
            disabled={loading || deleting}
            title={t("settings.sqliteRefresh")}
          >
            {loading ? <SmallLoader /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </header>

      <section className="windows95-border bg-surface p-2 text-[10px]">
        <div className="flex items-start gap-1">
          <AlertTriangle className="text-highlight mt-0.5 size-3 shrink-0" />
          <span>
            {mode === "query"
              ? t("settings.sqliteQueryHint")
              : t("settings.sqliteSafetyHint")}
          </span>
        </div>
      </section>

      {error && (
        <section className="windows95-border bg-destructive/10 text-destructive p-2 text-[10px]">
          {error}
        </section>
      )}

      <section className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px]">
          {t("settings.sqliteDatabase")}
          <Select
            value={selectedDatabase}
            onChange={(value) => {
              setSelectedDatabase(value);
              setTables([]);
              setSelectedTable("");
              setRows(null);
              setQueryResult(null);
              setPage(1);
            }}
            options={databaseOptions}
            disabled={loading || deleting}
          />
        </label>
        {mode === "browse" && (
          <label className="flex flex-col gap-1 text-[10px]">
            {t("settings.sqliteTable")}
            <Select
              value={selectedTable}
              onChange={(value) => {
                setSelectedTable(value);
                setPage(1);
                setSort(null);
              }}
              options={tableOptions}
              disabled={loading || deleting || tables.length === 0}
            />
          </label>
        )}
      </section>

      {mode === "query" ? (
        <section className="flex flex-col gap-2">
          <section className="windows95-border bg-primary p-2">
            <div className="mb-1 text-[10px]">
              <strong>{t("settings.sqliteQueryTitle")}</strong>
            </div>
            <textarea
              value={querySql}
              onChange={(event) => setQuerySql(event.target.value)}
              onKeyDown={(event) => {
                modEnter(runQuery)(event);
                if (event.key === "ArrowUp" && queryHistoryRef.current.length > 0) {
                  event.preventDefault();
                  navigateQueryHistory("up");
                } else if (
                  event.key === "ArrowDown" &&
                  queryHistoryRef.current.length > 0
                ) {
                  event.preventDefault();
                  navigateQueryHistory("down");
                }
              }}
              placeholder={t("settings.sqliteQueryPlaceholder")}
              disabled={queryLoading}
              spellCheck={false}
              className="windows95-border text-text windows95-text placeholder:text-muted disabled:bg-primary disabled:text-muted min-h-20 w-full resize-y bg-white p-1 font-mono text-[10px] outline-none"
            />
            <div className="mt-1 flex items-center justify-between gap-1">
              <span className="text-muted text-[9px]">
                {t("settings.sqliteQueryHistory")}
              </span>
              <Button
                className="h-5"
                variant="success"
                onClick={() => runQuery()}
                disabled={queryLoading || !selectedDatabase}
              >
                {queryLoading ? <SmallLoader /> : <Play className="size-3" />}
                {t("settings.sqliteQueryRun")}
              </Button>
            </div>
          </section>

          <section className="windows95-border min-h-40 overflow-auto bg-white">
            {queryLoading ? (
              <div className="flex min-h-40 items-center justify-center">
                <SmallLoader />
              </div>
            ) : !queryResult || queryResult.rows.length === 0 ? (
              <div className="text-muted flex min-h-40 items-center justify-center p-3 text-[10px]">
                {queryResult
                  ? t("settings.sqliteQueryEmpty")
                  : t("settings.sqliteEmpty")}
              </div>
            ) : (
              <>
                <div className="text-muted sticky left-0 flex items-center justify-between gap-1 border-b border-black/10 p-1 text-[10px]">
                  <span>
                    {t("settings.sqliteQueryResultSummary", {
                      count: queryResult.rows.length,
                    })}
                  </span>
                  <Button
                    className="h-5"
                    onClick={() =>
                      exportRows(
                        queryResult.columns,
                        queryResult.rows,
                        "query-result"
                      )
                    }
                  >
                    <Download className="size-3" />
                    {t("settings.sqliteExport")}
                  </Button>
                </div>
                {renderRowsTable(queryResult.columns, queryResult.rows, false)}
              </>
            )}
          </section>
        </section>
      ) : (
        <>
          {selectedTableInfo && (
            <section className="windows95-border bg-primary p-2">
              <div className="mb-1 flex items-center gap-1 text-[10px]">
                <strong>{t("settings.sqliteSchema")}</strong>
                <span className="text-muted">{selectedTableInfo.name}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedTableInfo.columns.map((column) => (
                  <span
                    key={column.name}
                    className="windows95-border bg-white px-1 py-0.5 text-[9px]"
                    title={column.dataType || t("settings.sqliteUnknownType")}
                  >
                    {column.name}
                    {column.primaryKey ? " · PK" : ""}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex min-w-56 flex-1 gap-1">
                <Input
                  ref={filterInputRef}
                  value={filterInput}
                  onChange={(event) => setFilterInput(event.target.value)}
                  onKeyDown={enterSubmit(applyFilter)}
                  placeholder={t("settings.sqliteFilterPlaceholder")}
                  disabled={deleting}
                />
                <Button
                  size="icon"
                  className="size-6"
                  onClick={applyFilter}
                  title={t("settings.sqliteFilter")}
                  disabled={deleting}
                >
                  <Search className="size-3" />
                </Button>
              </div>
              <span className="text-muted text-[10px]">
                {rows
                  ? t("settings.sqliteRowsSummary", { count: rows.total })
                  : ""}
              </span>
              {primaryKeys.length > 0 && (
                <span className="text-muted text-[10px]">
                  {Object.keys(selectedRows).length > 0
                    ? t("settings.sqliteSelectedCount", {
                        count: Object.keys(selectedRows).length,
                      })
                    : ""}
                </span>
              )}
              {primaryKeys.length > 0 && (
                <Button
                  className="h-5"
                  variant="destructive"
                  disabled={Object.keys(selectedRows).length === 0 || deleting}
                  onClick={() => setPendingBatchDelete(true)}
                  title={t("settings.sqliteDeleteSelected", {
                    count: Object.keys(selectedRows).length,
                  })}
                >
                  <Trash2 className="size-3" />
                  {t("settings.sqliteDeleteSelected", {
                    count: Object.keys(selectedRows).length,
                  })}
                </Button>
              )}
              <label className="flex items-center gap-1 text-[10px]">
                <Checkbox
                  checked={showImages}
                  onChange={(v) => patchSettings({ sqliteShowImages: v })}
                />
                {t("settings.sqliteShowImages")}
              </label>
              <Button
                className="h-5"
                disabled={!rows || rows.rows.length === 0}
                onClick={() =>
                  rows &&
                  exportRows(rows.columns, rows.rows, selectedTable)
                }
                title={t("settings.sqliteExport")}
              >
                <Download className="size-3" />
                {t("settings.sqliteExport")}
              </Button>
            </div>
            {filterableColumns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted text-[9px]">
                  {t("settings.sqliteFilterFields")}
                </span>
                {filterableColumns.map((column) => (
                  <button
                    key={column.name}
                    type="button"
                    className="windows95-border hover:bg-surface active:bg-secondary windows95-text bg-white px-1 py-0.5 text-[9px] active:text-white"
                    title={t("settings.sqliteFilterTag", {
                      template: `${column.name} ${isTextColumn(column.name) ? "~" : "="} `,
                    })}
                    onClick={() => insertFilterTemplate(column.name)}
                  >
                    {column.name}
                  </button>
                ))}
              </div>
            )}
            <span className="text-muted text-[9px]">
              {t("settings.sqliteFilterHint")}
            </span>
          </section>

          <section className="windows95-border min-h-40 overflow-auto bg-white">
            {loadingRows ? (
              <div className="flex min-h-40 items-center justify-center">
                <SmallLoader />
              </div>
            ) : !rows || rows.rows.length === 0 ? (
              <div className="text-muted flex min-h-40 items-center justify-center p-3 text-[10px]">
                {t("settings.sqliteEmpty")}
              </div>
            ) : (
              renderRowsTable(rows.columns, rows.rows, true)
            )}
          </section>

          <Pagination
            total={total}
            page={page}
            lastPage={lastPage}
            from={from}
            to={to}
            onPageChange={setPaged}
            statusText={t("settings.sqlitePage", { page, total: lastPage })}
          />
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={t("settings.sqliteDeleteTitle")}
          message={t("settings.sqliteDeleteMessage", {
            key: Array.isArray(pendingDelete)
              ? pendingDelete.join(" | ")
              : pendingDelete,
            table: selectedTable,
          })}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={() => deleteRow()}
          onCancel={() => setPendingDelete(null)}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {pendingBatchDelete && (
        <ConfirmDialog
          open
          title={t("settings.sqliteDeleteTitle")}
          message={t("settings.sqliteDeleteSelected", {
            count: Object.keys(selectedRows).length,
          })}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={() => deleteBatch()}
          onCancel={() => setPendingBatchDelete(false)}
          onClose={() => setPendingBatchDelete(false)}
        />
      )}

      {selectedCell && (
        <Modal
          header={`${t("settings.sqliteCellTitle")} · ${selectedCell.column}`}
          onClose={() => setSelectedCell(null)}
          className="w-xl"
        >
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-muted text-[10px]">
                {t("settings.sqliteCellColumn")}: {selectedCell.column}
              </span>
              <div className="flex gap-1">
                <Button
                  className="h-5"
                  onClick={() => copyCell()}
                  disabled={!cellValue || cellLoading}
                >
                  {cellCopied ? (
                    <Check className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  {cellCopied
                    ? t("settings.sqliteCellCopied")
                    : t("settings.sqliteCellCopy")}
                </Button>
                <Button
                  className="h-5"
                  onClick={() => setCellEditing(true)}
                  disabled={!canEditCell}
                  title={
                    cellIsBlob ? t("settings.sqliteUnknownType") : undefined
                  }
                >
                  <Pencil className="size-3" />
                  {t("settings.sqliteCellEdit")}
                </Button>
              </div>
            </div>
            {cellLoading ? (
              <div className="flex min-h-20 items-center justify-center">
                <SmallLoader />
              </div>
            ) : cellEditing ? (
              <>
                <textarea
                  value={cellEdit}
                  onChange={(event) => setCellEdit(event.target.value)}
                  placeholder={t("settings.sqliteCellPlaceholder")}
                  disabled={cellSaving}
                  spellCheck={false}
                  className="windows95-border text-text windows95-text placeholder:text-muted disabled:bg-primary disabled:text-muted min-h-24 w-full resize-y bg-white p-1 font-mono text-[10px] outline-none"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    className="h-5"
                    onClick={() => setCellEditing(false)}
                    disabled={cellSaving}
                  >
                    {t("settings.sqliteCellCancel")}
                  </Button>
                  <Button
                    className="h-5"
                    variant="success"
                    onClick={() => saveCell()}
                    disabled={cellSaving}
                  >
                    {cellSaving ? (
                      <SmallLoader />
                    ) : (
                      <Check className="size-3" />
                    )}
                    {t("settings.sqliteCellSave")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {cellIsImage && (
                  <div className="windows95-border bg-primary flex h-64 items-center justify-center p-1">
                    <Image
                      src={cellValue}
                      alt={selectedCell?.column ?? ""}
                      type="contain"
                      className="h-full w-full bg-white"
                    />
                  </div>
                )}
                <pre className="windows95-border text-text windows95-text max-h-64 min-h-20 w-full overflow-auto bg-white p-1 text-[10px] break-words whitespace-pre-wrap">
                  {cellValue}
                </pre>
              </>
            )}
          </section>
        </Modal>
      )}
    </main>
  );
}
