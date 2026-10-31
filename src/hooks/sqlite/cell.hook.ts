import { useRef, useState } from "react";

import { sqliteApi } from "@/api/sqlite.api";
import { Debouncer } from "@/lib/core/debounce.utils";
import { displayCell } from "@/lib/core/sqliteRow.utils";
import { attemptAll, reportBackgroundError } from "@/lib/core/attempt.utils";
import { assetUrl, isImageUrl } from "@/lib/graphics/image.utils";
import { COPIED_FEEDBACK_MS } from "@/lib/core/notification.utils";
import type { SqliteRowsPage, SqliteSelectedCell, SqliteTableInfo } from "@/types/core/sqlite";

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
  const [cellValue, setCellValue] = useState<string>("");
  const [cellLoading, setCellLoading] = useState<boolean>(false);
  const [cellEditing, setCellEditing] = useState<boolean>(false);
  const [cellEdit, setCellEdit] = useState<string>("");
  const [cellSaving, setCellSaving] = useState<boolean>(false);
  const [cellCopied, setCellCopied] = useState<boolean>(false);
  const copiedHideRef = useRef<Debouncer<[]> | null>(null);
  const hideCopiedSoon = () => {
    if (copiedHideRef.current === null) {
      copiedHideRef.current = new Debouncer(() => setCellCopied(false), {
        wait: COPIED_FEEDBACK_MS,
      });
    }
    copiedHideRef.current.maybeExecute();
  };
  const [cellImageSrc, setCellImageSrc] = useState<string | null>(null);

  function isImageColumn(column: string): boolean {
    return (selectedTableInfo?.columns ?? []).some((c) => c.isImage && c.name === column);
  }

  async function loadImageCell(column: string, keys: string[]): Promise<void> {
    const path = await sqliteApi.getCellImage(selectedDatabase!, selectedTable!, column, keys);
    if (path) setCellImageSrc(assetUrl(path));
  }

  async function loadTextCell(column: string, keys: string[]): Promise<void> {
    const value = await sqliteApi.getCell(selectedDatabase!, selectedTable!, column, keys);
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
    copiedHideRef.current?.cancel();
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
        hideCopiedSoon();
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
          sqliteApi.updateCell(
            selectedDatabase,
            selectedTable,
            selectedCell.column,
            selectedCell.keys ?? [],
            cellEdit
          ),
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
