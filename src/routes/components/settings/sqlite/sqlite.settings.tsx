import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { PAGE_SIZE, QUERY_HISTORY_MAX } from "@/config/settings/sqlite.config";
import { usePagination } from "@/hooks/pagination.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { isImageUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { COPIED_FEEDBACK_MS } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { SqliteDatabaseInfo, SqliteRowsPage, SqliteTableInfo, SortState } from "@/types/sqlite";

import { BackupPanel } from "./backup.sqlite";
import { SqliteBrowseResult } from "./browseResult.sqlite";
import { CellModal } from "./cell.sqlite";
import { SqliteDialogs } from "./dialogs.sqlite";
import { DisplayToggle } from "./display.sqlite";
import { SqliteFilterBuilder } from "./filter.sqlite";
import { FilterBar } from "./filterbar.sqlite";
import { SqliteHeader } from "./header.sqlite";
import { SqliteObjectGrid } from "./objectGrid.sqlite";
import { SqliteObjectPane } from "./objectPane.sqlite";
import { QueryPanel } from "./query.sqlite";
import { SqliteQueryResult } from "./queryresult.sqlite";
import { SchemaSection } from "./schema.sqlite";
import { SqliteSelectorGrid } from "./selector.sqlite";
import { RowsTable } from "./table.sqlite";
import { displayCell } from "./table/row.sqlite";
import { TableActions } from "./tableactions.sqlite";
import { SqliteFilterTags } from "./tags.sqlite";
import { ViewFlags } from "./viewflags.sqlite";
import { VirtualRowsTable } from "./virtual.sqlite";

export default function SqliteSettings() {
  const { t } = useI18n();
  const showImages = useSettingsStore((s) => s.sqliteShowImages);
  const patchSettings = useSettingsStore((s) => s.patch);
  const [mode, setMode] = useState<"browse" | "query">("browse");
  const [object, setObject] = useState<"tables" | "backup">("tables");
  const [databases, setDatabases] = useState<SqliteDatabaseInfo[]>([]);
  const [tables, setTables] = useState<SqliteTableInfo[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [rows, setRows] = useState<SqliteRowsPage | null>(null);
  const [filterInput, setFilterInput] = useState("");
  const [filter, setFilter] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [display, setDisplay] = useState<"pagination" | "scroll">("pagination");
  const [accRows, setAccRows] = useState<Array<unknown>[]>([]);
  const requestedForLength = useRef(-1);
  const [hideId, setHideId] = useState(true);
  const [sort, setSort] = useState<SortState>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, string[]>>({});
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
      const result = await invokeTyped<SqliteDatabaseInfo[]>("list_sqlite_databases");
      setDatabases(result);
      setSelectedDatabase(
        (current) => current || result.find((item) => item.available)?.id || result[0]?.id || ""
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
    invokeTyped<SqliteTableInfo[]>("get_sqlite_tables", { database: selectedDatabase })
      .then((result) => {
        if (cancelled) return;
        setTables(result);
        setSelectedTable((current) =>
          result.some((table) => table.name === current) ? current : result[0]?.name || ""
        );
        setPage(1);
        setSort(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
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
      const result = await invokeTyped<SqliteRowsPage>("get_sqlite_rows", {
        database: selectedDatabase,
        table: selectedTable,
        page,
        pageSize: PAGE_SIZE,
        filter: filter || null,
        orderColumn: sort?.column ?? null,
        orderDirection: sort?.direction ?? null,
      });
      setRows(result);
      if (display === "scroll") {
        if (page === 1) {
          setAccRows(result.rows);
          requestedForLength.current = -1;
        } else {
          setAccRows((current) => [...current, ...result.rows]);
        }
      }
      const nextTotalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > nextTotalPages) setPage(nextTotalPages);
    } catch (error: unknown) {
      setRows(null);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingRows(false);
    }
  }, [page, filter, selectedDatabase, selectedTable, sort, display]);

  const handleLoadMore = useCallback(() => {
    if (requestedForLength.current === accRows.length) return;
    requestedForLength.current = accRows.length;
    setPage((current) => current + 1);
  }, [accRows.length]);

  const handleDisplayChange = useCallback((value: "pagination" | "scroll") => {
    setDisplay(value);
    setPage(1);
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const selectedTableInfo = tables.find((table) => table.name === selectedTable);
  const primaryKeys = (selectedTableInfo?.columns ?? [])
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
  const {
    total,
    from,
    to,
    lastPage,
    setPage: setPaged,
  } = usePagination(rows?.total ?? 0, PAGE_SIZE, page, setPage);

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
        label: `${database.label}${database.available ? "" : ` - ${t("settings.sqlite.unavailable")}`}`,
      })),
    [databases, t]
  );
  const tableOptions = useMemo(
    () =>
      tables.map((table) => ({ value: table.name, label: `${table.name} (${table.rowCount})` })),
    [tables]
  );

  const applyFilter = () => {
    setPage(1);
    setFilter(filterInput.trim());
  };

  const isTextColumn = (column: string) => {
    const type = (
      selectedTableInfo?.columns.find((item) => item.name === column)?.dataType ?? ""
    ).toUpperCase();
    return !["INTEGER", "INT", "REAL", "NUMERIC", "FLOAT", "DOUBLE", "BLOB"].includes(type);
  };

  const filterableColumns = (selectedTableInfo?.columns ?? []).filter(
    (column) => column.dataType.toUpperCase() !== "BLOB"
  );

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
      if (history.length > QUERY_HISTORY_MAX) history.shift();
    }
    queryHistoryIndexRef.current = -1;
    setQueryLoading(true);
    setError(null);
    try {
      const result = await invokeTyped<SqliteRowsPage>("run_sqlite_query", {
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

  const exportRows = async (columns: string[], rowsArray: Array<unknown>[], name: string) => {
    try {
      const path = await save({
        defaultPath: `${name}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invokeTyped("write_sqlite_export", {
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
    if (!rowsToDelete.length || !selectedDatabase || !selectedTable || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setPendingBatchDelete(false);
    try {
      await invokeTyped("delete_sqlite_rows", {
        database: selectedDatabase,
        table: selectedTable,
        keys: rowsToDelete,
      });
      setSelectedRows({});
      await loadRows();
      await refreshDatabases();
      const refreshedTables = await invokeTyped<SqliteTableInfo[]>("get_sqlite_tables", {
        database: selectedDatabase,
      });
      setTables(refreshedTables);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  function isBlobColumn(column: string): boolean {
    const blobColumns = new Set(
      (selectedTableInfo?.columns ?? [])
        .filter((c) => c.dataType.toUpperCase() === "BLOB")
        .map((c) => c.name)
    );
    return blobColumns.has(column);
  }

  async function loadBlobCell(column: string, keys: string[]): Promise<void> {
    const blob = await invokeTyped<string | null>("get_sqlite_cell_blob", {
      database: selectedDatabase!,
      table: selectedTable!,
      column,
      keys,
    });
    if (!blob) return;
    setCellValue(blob);
    setCellEdit(blob);
    setCellIsImage(true);
  }

  async function loadTextCell(column: string, keys: string[]): Promise<void> {
    const value = await invokeTyped<string | null>("get_sqlite_cell", {
      database: selectedDatabase!,
      table: selectedTable!,
      column,
      keys,
    });
    const resolved = value ?? "NULL";
    setCellValue(resolved);
    setCellEdit(resolved);
    if (isImageUrl(resolved)) setCellIsImage(true);
  }

  const openCell = async (row: unknown[], column: string) => {
    const keys = primaryKeyValues(row);
    const display = displayCell(row[rows?.columns.indexOf(column) ?? -1] as unknown);
    setSelectedCell({ column, keys, display });
    setCellValue(display);
    setCellEdit(display);
    setCellEditing(false);
    setCellCopied(false);
    setCellIsImage(false);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    if (!keys || !selectedDatabase || !selectedTable) return;
    setCellLoading(true);
    try {
      if (isBlobColumn(column)) await loadBlobCell(column, keys);
      else await loadTextCell(column, keys);
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
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCellCopied(false), COPIED_FEEDBACK_MS);
    } catch (error) {
      reportBackgroundError("sqlite.copy-cell", error);
    }
  };

  const saveCell = async () => {
    if (!selectedCell || !selectedCell.keys || !selectedDatabase || !selectedTable || cellSaving)
      return;
    setCellSaving(true);
    setError(null);
    try {
      await invokeTyped("update_sqlite_cell", {
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
      await invokeTyped("delete_sqlite_row", {
        database: selectedDatabase,
        table: selectedTable,
        keys: keyToDelete,
      });
      setPendingDelete(null);
      await loadRows();
      await refreshDatabases();
      const refreshedTables = await invokeTyped<SqliteTableInfo[]>("get_sqlite_tables", {
        database: selectedDatabase,
      });
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
  const canEditCell = !!selectedCell?.keys && !cellIsBlob && !cellLoading && !cellSaving;

  const renderRowsTable = (
    columns: string[],
    rowsArray: Array<unknown>[],
    interactive: boolean,
    hideIdValue: boolean,
    baseIndexValue: number
  ) => (
    <RowsTable
      columns={columns}
      rowsArray={rowsArray}
      interactive={interactive}
      primaryKeys={primaryKeys}
      selectedRows={selectedRows}
      sort={sort}
      blobColumns={blobColumns}
      showImages={showImages}
      deleting={deleting}
      selectedDatabase={selectedDatabase}
      selectedTable={selectedTable}
      primaryKeyValues={primaryKeyValues}
      toggleAllRows={toggleAllRows}
      toggleSort={toggleSort}
      toggleRowSelection={toggleRowSelection}
      openCell={openCell}
      setPendingDelete={setPendingDelete}
      hideId={hideIdValue}
      baseIndex={baseIndexValue}
    />
  );

  const renderVirtualRowsTable = (
    columns: string[],
    rowsArray: Array<unknown>[],
    scrollRef: React.RefObject<HTMLElement | null>,
    hasMore: boolean,
    loadingMore: boolean
  ) => (
    <VirtualRowsTable
      columns={columns}
      rowsArray={rowsArray}
      interactive
      primaryKeys={primaryKeys}
      selectedRows={selectedRows}
      sort={sort}
      blobColumns={blobColumns}
      showImages={showImages}
      deleting={deleting}
      selectedDatabase={selectedDatabase}
      selectedTable={selectedTable}
      primaryKeyValues={primaryKeyValues}
      toggleAllRows={toggleAllRows}
      toggleSort={toggleSort}
      toggleRowSelection={toggleRowSelection}
      openCell={openCell}
      setPendingDelete={setPendingDelete}
      hideId={hideId}
      baseIndex={0}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={handleLoadMore}
      scrollRef={scrollRef}
    />
  );

  const exportable = useMemo(
    () => !!rows && (display === "scroll" ? accRows.length > 0 : rows.rows.length > 0),
    [rows, display, accRows]
  );

  const handleExport = () => {
    if (!rows) return;
    exportRows(rows.columns, display === "scroll" ? accRows : rows.rows, selectedTable);
  };

  const querySection = (
    <section className="flex flex-col gap-2">
      <QueryPanel
        querySql={querySql}
        setQuerySql={setQuerySql}
        runQuery={runQuery}
        navigateHistory={navigateQueryHistory}
        queryLoading={queryLoading}
        canRun={!!selectedDatabase}
        getHistoryCount={() => queryHistoryRef.current.length}
      />
      <SqliteQueryResult
        queryResult={queryResult}
        queryLoading={queryLoading}
        onExport={() => {
          if (queryResult) exportRows(queryResult.columns, queryResult.rows, "query-result");
        }}
        renderRowsTable={renderRowsTable}
      />
    </section>
  );

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-y-auto p-1">
      <SqliteHeader
        mode={mode}
        setMode={setMode}
        onRefresh={() => refreshDatabases()}
        loading={loading}
        deleting={deleting}
        error={error}
      />

      <SqliteObjectGrid
        pane={<SqliteObjectPane object={object} onSelect={setObject} />}
        showBackup={object === "backup"}
        backup={
          <BackupPanel
            database={selectedDatabase}
            databases={databaseOptions}
            onSelectDatabase={(value) => {
              setSelectedDatabase(value);
              setTables([]);
              setSelectedTable("");
              setRows(null);
              setQueryResult(null);
              setPage(1);
            }}
            onChanged={() => refreshDatabases()}
          />
        }
        tables={
          <>
            <SqliteSelectorGrid
              mode={mode}
              selectedDatabase={selectedDatabase}
              onSelectDatabase={(value) => {
                setSelectedDatabase(value);
                setTables([]);
                setSelectedTable("");
                setRows(null);
                setQueryResult(null);
                setPage(1);
              }}
              databaseOptions={databaseOptions}
              selectedTable={selectedTable}
              onSelectTable={(value) => {
                setSelectedTable(value);
                setPage(1);
                setSort(null);
              }}
              tableOptions={tableOptions}
              loading={loading}
              deleting={deleting}
              tableCount={tables.length}
            />

            {mode === "query" ? (
              querySection
            ) : (
              <>
                {selectedTableInfo && <SchemaSection tableInfo={selectedTableInfo} />}
                <div className="ui-toolbar ui-panel h-14 gap-1 p-1">
                  <FilterBar
                    filterInput={filterInput}
                    setFilterInput={setFilterInput}
                    filterInputRef={filterInputRef}
                    applyFilter={applyFilter}
                    rowsTotal={rows?.total}
                    deleting={deleting}
                  />
                  <TableActions
                    selectedCount={Object.keys(selectedRows).length}
                    hasPrimaryKeys={primaryKeys.length > 0}
                    deleting={deleting}
                    onBatchDelete={() => setPendingBatchDelete(true)}
                    canExport={exportable}
                    onExport={handleExport}
                  />
                  <ViewFlags
                    showImages={showImages}
                    setShowImages={(v) => patchSettings({ sqliteShowImages: v })}
                    hideId={hideId}
                    onHideIdChange={setHideId}
                  />
                  <DisplayToggle
                    display={display}
                    onDisplayChange={handleDisplayChange}
                    deleting={deleting}
                  />
                </div>
                <SqliteFilterBuilder
                  columns={filterableColumns}
                  isTextColumn={isTextColumn}
                  filterInput={filterInput}
                  setFilterInput={setFilterInput}
                  filterInputRef={filterInputRef}
                  applyFilter={applyFilter}
                />
                <SqliteFilterTags
                  columns={filterableColumns}
                  isTextColumn={isTextColumn}
                  onTagClick={insertFilterTemplate}
                />
                <span className="text-hint windows95-text text-xs">
                  {t("settings.sqlite.filter.hint")}
                </span>
                <SqliteBrowseResult
                  loadingRows={loadingRows}
                  rows={rows}
                  display={display}
                  accRows={accRows}
                  hideId={hideId}
                  total={total}
                  page={page}
                  lastPage={lastPage}
                  from={from}
                  to={to}
                  onPageChange={setPaged}
                  renderRowsTable={renderRowsTable}
                  renderVirtualRowsTable={renderVirtualRowsTable}
                />
              </>
            )}
          </>
        }
      />

      <SqliteDialogs
        pendingDelete={pendingDelete}
        pendingBatchDelete={pendingBatchDelete}
        selectedRows={selectedRows}
        selectedTable={selectedTable}
        onDeleteRow={() => deleteRow()}
        onCancelDelete={() => setPendingDelete(null)}
        onDeleteBatch={() => deleteBatch()}
        onCancelBatch={() => setPendingBatchDelete(false)}
      />

      {selectedCell && (
        <CellModal
          selectedCell={selectedCell}
          cellValue={cellValue}
          cellLoading={cellLoading}
          cellEditing={cellEditing}
          cellEdit={cellEdit}
          cellSaving={cellSaving}
          cellCopied={cellCopied}
          cellIsImage={cellIsImage}
          canEditCell={!!canEditCell}
          cellIsBlob={!!cellIsBlob}
          onClose={() => setSelectedCell(null)}
          onCopy={copyCell}
          onEdit={() => setCellEditing(true)}
          onEditChange={setCellEdit}
          onCancelEdit={() => setCellEditing(false)}
          onSave={saveCell}
        />
      )}
    </div>
  );
}
