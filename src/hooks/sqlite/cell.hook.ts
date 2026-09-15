import { useRef, useState } from "react";

import { displayCell } from "@/lib/sqlite/row.utils";
import { attemptAll, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { assetUrl, isImageUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { COPIED_FEEDBACK_MS } from "@/lib/utils/notification.utils";
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
  const [cellImageSrc, setCellImageSrc] = useState<string | null>(null);

  function isImageColumn(column: string): boolean {
    return (selectedTableInfo?.columns ?? []).some((c) => c.isImage && c.name === column);
  }

  async function loadImageCell(column: string, keys: string[]): Promise<void> {
    const path = await invokeTyped<string | null>("get_sqlite_cell_image", {
      database: selectedDatabase!,
      table: selectedTable!,
      column,
      keys,
    });
    if (path) setCellImageSrc(assetUrl(path));
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
    if (isImageUrl(resolved)) setCellImageSrc(resolved);
  }

  const openCell = async (row: unknown[], column: string) => {
    const keys = primaryKeyValues(row);
    const display = displayCell(row[rows?.columns.indexOf(column) ?? -1] as unknown);
    setSelectedCell({ column, keys, display });
    setCellValue(display);
    setCellEdit(display);
    setCellEditing(false);
    setCellCopied(false);
    setCellImageSrc(null);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    if (!keys || !selectedDatabase || !selectedTable) return;
    setCellLoading(true);
    const failure = await attemptAll(
      [() => (isImageColumn(column) ? loadImageCell(column, keys) : loadTextCell(column, keys))],
      { onFinally: () => setCellLoading(false) }
    );
    if (failure !== null) setError(failure.message);
  };

  const copyCell = async () => {
    if (!cellValue) return;
    const failure = await attemptAll([
      () => navigator.clipboard.writeText(cellValue),
      () => setCellCopied(true),
      () => {
        if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = window.setTimeout(() => setCellCopied(false), COPIED_FEEDBACK_MS);
      },
    ]);
    if (failure !== null) reportBackgroundError("sqlite.copy-cell", failure);
  };

  const saveCell = async () => {
    if (!selectedCell || !selectedCell.keys || !selectedDatabase || !selectedTable || cellSaving)
      return;
    setCellSaving(true);
    setError(null);
    const failure = await attemptAll(
      [
        () =>
          invokeTyped("update_sqlite_cell", {
            database: selectedDatabase,
            table: selectedTable,
            column: selectedCell.column,
            keys: selectedCell.keys,
            value: cellEdit,
          }),
        () => setSelectedCell(null),
        () => loadRows(),
      ],
      { onFinally: () => setCellSaving(false) }
    );
    if (failure !== null) setError(failure.message);
  };

  const canEditCell = !!selectedCell?.keys && !cellLoading && !cellSaving;

  return {
    selectedCell,
    cellValue,
    cellLoading,
    cellEditing,
    cellEdit,
    cellSaving,
    cellCopied,
    cellImageSrc,
    canEditCell,
    openCell,
    copyCell,
    saveCell,
    setCellEditing,
    setCellEdit,
    closeCell: () => setSelectedCell(null),
  };
}
