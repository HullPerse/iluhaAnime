import { useRef, useState } from "react";

import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { isImageUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { COPIED_FEEDBACK_MS } from "@/lib/utils/notification.utils";
import { displayCell } from "@/routes/components/settings/sqlite/table/row.sqlite";
import type { SqliteRowsPage, SqliteSelectedCell, SqliteTableInfo } from "@/types/sqlite";

export function useSqliteCell(params: {
  rows: SqliteRowsPage | null;
  selectedDatabase: string;
  selectedTable: string;
  primaryKeyValues: (row: unknown[]) => string[] | null;
  selectedTableInfo: SqliteTableInfo | undefined;
  loadRows: () => Promise<void>;
  setError: (error: string | null) => void;
}) {
  const {
    rows,
    selectedDatabase,
    selectedTable,
    primaryKeyValues,
    selectedTableInfo,
    loadRows,
    setError,
  } = params;

  const [selectedCell, setSelectedCell] = useState<SqliteSelectedCell | null>(null);
  const [cellValue, setCellValue] = useState("");
  const [cellLoading, setCellLoading] = useState(false);
  const [cellEditing, setCellEditing] = useState(false);
  const [cellEdit, setCellEdit] = useState("");
  const [cellSaving, setCellSaving] = useState(false);
  const [cellCopied, setCellCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const [cellIsImage, setCellIsImage] = useState(false);

  function isBlobColumn(column: string): boolean {
    return (selectedTableInfo?.columns ?? []).some(
      (c) => c.dataType.toUpperCase() === "BLOB" && c.name === column
    );
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

  const cellColumnInfo = selectedTableInfo?.columns.find(
    (column) => column.name === selectedCell?.column
  );
  const cellIsBlob = cellColumnInfo?.dataType.toUpperCase() === "BLOB";
  const canEditCell = !!selectedCell?.keys && !cellIsBlob && !cellLoading && !cellSaving;

  return {
    selectedCell,
    cellValue,
    cellLoading,
    cellEditing,
    cellEdit,
    cellSaving,
    cellCopied,
    cellIsImage,
    cellIsBlob,
    canEditCell,
    openCell,
    copyCell,
    saveCell,
    setCellEditing,
    setCellEdit,
    closeCell: () => setSelectedCell(null),
  };
}
