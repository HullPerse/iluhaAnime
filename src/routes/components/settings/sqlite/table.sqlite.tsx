import { cn } from "@/lib/index.utils";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { MAX_CELL_PREVIEW } from "@/config/sqlite.config";
import { useI18n } from "@/lib/i18n";

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function previewCell(value: unknown): string {
  const rendered = displayCell(value);
  return rendered.length > MAX_CELL_PREVIEW
    ? `${rendered.slice(0, MAX_CELL_PREVIEW)}...`
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
  const [state, setState] = useState<"loading" | "image" | "not-image">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setSrc(null);
    invoke<string | null>("get_sqlite_cell_blob", { database, table, column, keys })
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
  }, [database, table, column, JSON.stringify(keys), keys]);

  if (state === "loading") return <span className="text-hint block text-xs">...</span>;
  if (state === "not-image" || !src) return <span className="text-hint block text-xs">[BLOB]</span>;
  return (
    <div className="windows95-border mx-auto size-16 shrink-0 overflow-hidden bg-white">
      <Image src={src} alt={alt} type="contain" className="h-full w-full" />
    </div>
  );
}

type SortState = { column: string; direction: "asc" | "desc" } | null;

type RowsTableProps = {
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
};

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
  const rendered = displayCell(value);
  const preview = previewCell(value);
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

export function RowsTable({
  columns,
  rowsArray,
  interactive,
  primaryKeys,
  selectedRows,
  sort,
  blobColumns,
  showImages,
  deleting,
  selectedDatabase,
  selectedTable,
  primaryKeyValues,
  toggleAllRows,
  toggleSort,
  toggleRowSelection,
  openCell,
  setPendingDelete,
}: RowsTableProps) {
  const { t } = useI18n();
  return (
    <table className="min-w-full border-collapse text-left text-xs">
      <thead className="bg-secondary sticky top-0 text-white">
        <tr>
          {interactive && primaryKeys.length > 0 && (
            <th className="w-8 border-r border-white/30 px-1 py-1 font-normal">
              <button
                type="button"
                className="flex items-center hover:cursor-pointer"
                title={t("settings.sqlite.select.all")}
                onClick={() => toggleAllRows(rowsArray)}
              >
                {rowsArray.every(
                  (row) => !!selectedRows[primaryKeyValues(row)?.join(" | ") ?? ""]
                ) ? (
                  <Check className="size-3" />
                ) : (
                  <span className="block size-3 border border-white/60" />
                )}
              </button>
            </th>
          )}
          {columns.map((column) => (
            <th key={column} className="border-r border-white/30 px-1 py-1 font-normal">
              {interactive ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-0.5 text-left hover:cursor-pointer"
                  title={
                    sort?.column === column
                      ? sort.direction === "asc"
                        ? t("settings.sqlite.sort.desc")
                        : t("settings.sqlite.sort.asc")
                      : t("settings.sqlite.sort.asc")
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
          {interactive && <th className="px-1 py-1 font-normal">{t("settings.sqlite.actions")}</th>}
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
              className={cn(selected && "bg-secondary/10", "hover:bg-surface border-b border-black/10 align-top")}
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
              {row.map((value, cellIndex) => (
                <td
                  key={`${cellIndex}-${rowIndex}`}
                  className="max-h-20 max-w-72 overflow-hidden px-1 py-1 wrap-break-word whitespace-pre-wrap"
                >
                  <RowCell
                    value={value}
                    column={columns[cellIndex]}
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
              ))}
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
        })}
      </tbody>
    </table>
  );
}

export { displayCell, previewCell, isImageUrl };
export type { SortState };
