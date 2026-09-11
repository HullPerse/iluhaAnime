import { cn } from "cn";
import { Check, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { MAX_CELL_PREVIEW } from "@/config/settings/sqlite.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { isImageUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";

function formatDateCell(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  const date = new Date(value < 1e11 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return null;
  const part = (n: number) => String(n).padStart(2, "0");
  return `${part(date.getDate())}.${part(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;
}

export function displayCell(value: unknown, column?: string): string {
  if (column?.toLowerCase() === "created_at") return formatDateCell(value) ?? String(value);
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function previewCell(value: unknown, column?: string): string {
  const rendered = displayCell(value, column);
  return rendered.length > MAX_CELL_PREVIEW
    ? `${rendered.slice(0, MAX_CELL_PREVIEW)}...`
    : rendered;
}

export function makeRowId(
  row: unknown[],
  rowIndex: number,
  interactive: boolean,
  primaryKeyValues: (row: unknown[]) => string[] | null
): string {
  const rowKeys = interactive ? primaryKeyValues(row) : null;
  return rowKeys ? rowKeys.join(" | ") : `${rowIndex}`;
}

export function DataRow({
  row,
  rowIndex,
  columns,
  interactive,
  selectedRows,
  primaryKeyValues,
  toggleRowSelection,
  showImages,
  blobColumns,
  selectedDatabase,
  selectedTable,
  openCell,
  setPendingDelete,
  deleting,
  idHidden,
  rowNumber,
  measureRef,
  dataIndex,
}: {
  row: unknown[];
  rowIndex: number;
  columns: string[];
  interactive: boolean;
  selectedRows: Record<string, string[]>;
  primaryKeyValues: (row: unknown[]) => string[] | null;
  toggleRowSelection: (keys: string[] | null) => void;
  showImages: boolean;
  blobColumns: Set<string>;
  selectedDatabase: string;
  selectedTable: string;
  openCell: (row: unknown[], column: string) => void;
  setPendingDelete: (keys: string[]) => void;
  deleting: boolean;
  idHidden: boolean;
  rowNumber: number | null;
  measureRef?: (el: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) {
  const { t } = useI18n();
  const rowKeys = interactive ? primaryKeyValues(row) : null;
  const rowId = rowKeys ? rowKeys.join(" | ") : `${rowIndex}`;
  const selected = interactive ? !!rowKeys && !!selectedRows[rowId] : false;
  return (
    <tr
      ref={measureRef}
      data-index={dataIndex}
      className={cn(
        selected && "bg-secondary/10",
        "hover:bg-surface border-b border-black/10 align-top"
      )}
    >
      {interactive && rowKeys && (
        <td className="px-1 py-1">
          <button
            type="button"
            className="flex items-center hover:cursor-pointer"
            onClick={() => toggleRowSelection(rowKeys)}
            title={t("settings.sqlite.select.all")}
          >
            {selected ? (
              <Check className="size-3" />
            ) : (
              <span className="block size-3 border border-black/40" />
            )}
          </button>
        </td>
      )}
      {rowNumber !== null && <td className="text-hint px-1 py-1">{rowNumber}</td>}
      {row.map((value, cellIndex) => {
        const name = columns[cellIndex];
        if (name === undefined || (idHidden && name === "id")) return null;
        return (
          <td
            key={`${cellIndex}-${rowIndex}`}
            className="max-h-20 max-w-72 overflow-hidden px-1 py-1 wrap-break-word whitespace-pre-wrap"
          >
            <RowCell
              value={value}
              column={name}
              interactive={interactive}
              row={row}
              rowKeys={rowKeys}
              showImages={showImages}
              blobColumns={blobColumns}
              selectedDatabase={selectedDatabase}
              selectedTable={selectedTable}
              openCell={openCell}
            />
          </td>
        );
      })}
      {interactive && (
        <td className="px-1 py-1">
          <Button
            size="icon"
            className="size-5"
            title={t("settings.sqlite.delete.row")}
            onClick={() => setPendingDelete(rowKeys ?? [])}
            disabled={!rowKeys || deleting}
          >
            <Trash2 className="size-3" />
          </Button>
        </td>
      )}
    </tr>
  );
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
  const [state, setState] = useState<"loading" | "image" | "not-image">("loading");
  const keysJson = useMemo(() => JSON.stringify(keys), [keys]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setSrc(null);
    invokeTyped<string | null>("get_sqlite_cell_blob", {
      database,
      table,
      column,
      keys: JSON.parse(keysJson),
    })
      .then((value) => {
        if (cancelled) return;
        if (value) {
          setSrc(value);
          setState("image");
        } else setState("not-image");
      })
      .catch(() => {
        if (!cancelled) setState("not-image");
      });
    return () => {
      cancelled = true;
    };
  }, [database, column, table, keysJson]);

  if (state === "loading") return <span className="text-hint block text-xs">...</span>;
  if (state === "not-image" || !src) return <span className="text-hint block text-xs">[BLOB]</span>;
  return (
    <div className="windows95-border mx-auto size-16 shrink-0 overflow-hidden bg-white">
      <Image src={src} alt={alt} type="contain" className="h-full w-full" />
    </div>
  );
}

function RowCell({
  value,
  column,
  interactive,
  row,
  rowKeys,
  showImages,
  blobColumns,
  selectedDatabase,
  selectedTable,
  openCell,
}: {
  value: unknown;
  column: string;
  interactive: boolean;
  row: unknown[];
  rowKeys: string[] | null;
  showImages: boolean;
  blobColumns: Set<string>;
  selectedDatabase: string;
  selectedTable: string;
  openCell: (row: unknown[], column: string) => void;
}) {
  const rendered = displayCell(value, column);
  const preview = previewCell(value, column);
  if (!interactive) return <>{preview}</>;
  const showBlobImage = showImages && blobColumns.has(column);
  const showUrlImage = showImages && isImageUrl(value);
  return (
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
          alt={column}
        />
      ) : showUrlImage ? (
        <Image
          src={value as string}
          alt={column}
          type="contain"
          className="h-12 w-12 bg-white object-contain"
        />
      ) : (
        preview
      )}
    </button>
  );
}
